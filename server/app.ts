import {
  collaboratorPermissionsSchema,
  collaboratorPermissionChangesSchema,
  hasPermission,
  type Permission,
} from "../shared/permissions";
import { deleteCode, deleteProperty } from "./deletion";
import { accountBackoff } from "./account-backoff";
import { passwordWorkLimiter, invalidLinkBudget } from "./abuse-limits";
import { notificationReads } from "./notification-reads";
import { portableBackupRoutes } from "./portable-backup";
import { MAX_BACKUP_BYTES } from "../shared/backup";
import {
  wantsNotification,
  type NotificationContext,
} from "../shared/notifications";
import {
  log,
  logError,
  withLogContext,
  setLogActor,
  setLogResource,
  logRoute,
} from "./log";
import { Hono } from "hono";
import { realtime, upgradeWebSocket } from "./realtime";
import { z } from "zod";
import type { DB } from "./db";
import { vault, token, digest } from "./security";
import { openDevice, type DeviceAdapter } from "./devices";
import {
  codeInputSchema,
  STAFF_ACCESS_START,
  STAFF_ACCESS_END,
  doorSchema,
  propertySchema,
  guestLinksSchema,
  defaultTemplates,
  localDate,
} from "../shared/schema";
import { connectorRoutes } from "./connectors";
import { databaseLifecycle } from "./lifecycle";
import { pruneNotifications } from "./notifications";
import { breakfastAccessRoutes, mayReadBreakfast } from "./breakfast-access";
type Env = {
  Bindings: { clientIP?: string; server?: Bun.Server<any> };
  Variables: { user: any; csrf: string };
};
export function createApp(
  db: DB,
  config: {
    key: string;
    setupToken: string;
    origin: string;
    device?: DeviceAdapter;
  },
) {
  const app = new Hono<Env>(),
    crypto = vault(config.key);
  const passwordWork = passwordWorkLimiter();
  const accountAttempts = accountBackoff(db);
  function checkAccountAttempts(c: any, email: string) {
    const retryAfter = accountAttempts.take(email);
    if (retryAfter) {
      c.header("Retry-After", String(retryAfter));
      fail("Too many attempts; try again shortly", 429);
    }
  }
  const invalidAlerts = invalidLinkBudget();
  const reads = notificationReads(db);
  const adapter = config.device ?? openDevice;
  const device: DeviceAdapter = async (kind, credentials) => {
    const started = performance.now();
    log("info", "device.action_started", { provider: kind });
    try {
      const result = await adapter(kind, credentials);
      log(
        result.status === "accepted" ? "info" : "warn",
        "device.action_completed",
        {
          provider: kind,
          outcome: result.status,
          durationMs: Math.round(performance.now() - started),
        },
      );
      return result;
    } catch (e) {
      logError("device.action_exception", e, {
        provider: kind,
        durationMs: Math.round(performance.now() - started),
      });
      throw e;
    }
  };
  const lifecycle = databaseLifecycle(db);
  pruneNotifications(db);
  const get = (sql: string, ...args: any[]) =>
    db.query(sql).get(...args) as any;
  const all = (sql: string, ...args: any[]) =>
    db.query(sql).all(...args) as any[];
  const run = (sql: string, ...args: any[]) => db.query(sql).run(...args);
  const fail = (message: string, status = 400) => {
    const reasons: Record<string, string> = {
      "Access expired": "access_expired",
      "Access is not yet valid": "access_premature",
      "Single-use access already consumed": "single_use_consumed",
      "Door permission paused": "permission_paused",
      "Door disabled": "door_disabled",
      "Door not permitted": "door_not_permitted",
      "Invalid or revoked access link": "invalid_access_link",
      "Previous action is unresolved": "unresolved_action",
    };
    if (reasons[message])
      log("warn", "access.rejected", { reason: reasons[message], status });
    throw Object.assign(Error(message), { status });
  };
  function event(
    type: string,
    message: string,
    propertyId: string | null = null,
    codeId: string | null = null,
    context: NotificationContext = {},
  ) {
    const id = cryptoRandom();
    log(
      type.includes("denied") ||
        type.includes("invalid") ||
        type.includes("failed") ||
        type.includes("uncertain")
        ? "warn"
        : "info",
      "activity.recorded",
      { eventId: id, eventType: type, propertyId, codeId },
    );
    const created = new Date().toISOString();
    run(
      "INSERT INTO events VALUES(?,?,?,?,?,?)",
      id,
      propertyId,
      codeId,
      type,
      message,
      created,
    );
    const code = codeId
      ? get("SELECT data FROM codes WHERE id=?", codeId)
      : null;
    const details = {
      ...context,
      ...(code ? { codeLabel: JSON.parse(code.data).label } : {}),
    };
    run("INSERT INTO event_context VALUES(?,?)", id, JSON.stringify(details));
    // Synchronous transactions have committed (or rolled back) before delivery.
    queueMicrotask(() => {
      if (get("SELECT id FROM events WHERE id=?", id))
        realtime(db).publish({
          id,
          property_id: propertyId,
          code_id: codeId,
          type,
          message,
          created,
          context: details,
        });
    });
    if (codeId && type.startsWith("access."))
      run(
        "INSERT INTO code_metrics(code_id,attempts,accepted) VALUES(?,1,?) ON CONFLICT(code_id) DO UPDATE SET attempts=attempts+1,accepted=accepted+excluded.accepted",
        codeId,
        type === "access.accepted" ? 1 : 0,
      );
    for (const s of all("SELECT * FROM subscriptions")) {
      const p = { properties: [], events: [], ...JSON.parse(s.preferences) };
      if (wantsNotification(p, propertyId, type))
        run(
          "INSERT OR IGNORE INTO jobs(event_id,subscription_id,next) VALUES(?,?,?)",
          id,
          s.id,
          Date.now(),
        );
    }
  }
  const cryptoRandom = () => globalThis.crypto.randomUUID();
  function owner(c: any) {
    if (c.get("user").role !== "owner") fail("Owner permission required", 403);
  }
  function permission(c: any, key: Permission) {
    if (!hasPermission(c.get("user"), key))
      fail("Collaborator permission required: " + key, 403);
  }
  const defaultPreferences = {
    tour: "pending",
    language: null,
    theme: "system",
  };
  function userView(user: any) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions:
        user.role === "owner"
          ? {
              createAccessCodes: true,
              createDoors: true,
              useBookingConnectors: true,
              createStaffCodes: true,
            }
          : collaboratorPermissionsSchema.parse(
              JSON.parse(
                get(
                  "SELECT data FROM user_permissions WHERE user_id=?",
                  user.id,
                )?.data ?? "{}",
              ),
            ),
      preferences: {
        ...defaultPreferences,
        ...JSON.parse(
          get("SELECT data FROM user_preferences WHERE user_id=?", user.id)
            ?.data ?? "{}",
        ),
      },
    };
  }
  function session(c: any, user: any) {
    setLogActor(user);
    log("info", "auth.succeeded");
    const raw = token(),
      csrf = token();
    run(
      "INSERT INTO sessions VALUES(?,?,?,?)",
      digest(raw),
      user.id,
      csrf,
      Date.now() + 7 * 86400000,
    );
    c.header(
      "Set-Cookie",
      `oshost_session=${raw}; HttpOnly; SameSite=Strict; Path=/api/; Max-Age=604800${config.origin.startsWith("https:") ? "; Secure" : ""}`,
    );
    return c.json({
      user: userView(user),
      csrf,
    });
  }
  app.use("/api/*", async (c, next) => {
    const requestId = cryptoRandom();
    const started = performance.now();
    c.header("X-Request-ID", requestId);
    return withLogContext(
      {
        requestId,
        method: c.req.method,
        route: logRoute(c.req.path),
        clientIP: c.env?.clientIP,
      },
      async () => {
        log("debug", "request.started");
        try {
          await next();
        } finally {
          log(
            c.res.status >= 500
              ? "error"
              : c.res.status >= 400
                ? "warn"
                : "info",
            "request.completed",
            {
              status: c.res.status,
              durationMs: Math.round((performance.now() - started) * 100) / 100,
            },
          );
        }
      },
    );
  });
  const buckets = new Map<string, { n: number; until: number }>();
  app.use("/api/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    const bodyLimit =
      c.req.path === "/api/v1/admin/import"
        ? MAX_BACKUP_BYTES
        : 8 * 1024 * 1024;
    if (Number(c.req.header("content-length") ?? 0) > bodyLimit)
      return c.json({ error: "Request too large" }, 413);
    if (c.req.method !== "GET" && c.req.header("origin") !== config.origin)
      return c.json({ error: "Origin rejected" }, 403);
    if (lifecycle.resetting)
      return c.json({ error: "Database reset in progress" }, 503);
    lifecycle.active++;
    try {
      await next();
    } finally {
      lifecycle.active--;
    }
  });
  app.use("/api/v1/*", async (c, next) => {
    if (
      c.req.path === "/api/v1/guest" ||
      c.req.path.startsWith("/api/v1/guest/") ||
      c.req.path.startsWith("/api/v1/auth/")
    ) {
      const key = `${c.req.path.startsWith("/api/v1/auth/") ? "auth" : "guest"}:${c.env?.clientIP ?? "direct"}`;
      const now = Date.now();
      if (buckets.size >= 10000)
        for (const [k, v] of buckets) if (v.until <= now) buckets.delete(k);
      const b = buckets.get(key);
      if (b && b.until > now) {
        if (++b.n > 100)
          return c.json({ error: "Too many attempts; try again shortly" }, 429);
      } else {
        if (!b && buckets.size >= 10000)
          return c.json({ error: "Too many attempts; try again shortly" }, 429);
        buckets.set(key, { n: 1, until: now + 60000 });
      }
    }
    await next();
  });
  app.onError((e, c) => {
    const status = e instanceof z.ZodError ? 400 : ((e as any).status ?? 500);
    if (status >= 500) logError("request.exception", e, { status });
    else log("warn", "request.rejected", { status, errorType: e.name });
    return c.json(
      {
        error:
          e instanceof z.ZodError
            ? e.issues.map((i) => i.message).join("; ")
            : (e as any).status
              ? e.message
              : "Request failed",
      },
      status as any,
    );
  });
  app.get("/api/v1/health", (c) => c.json({ status: "ok", schema: 7 }));
  app.get("/api/v1/auth/status", (c) =>
    c.json({ needsSetup: !get("SELECT 1 FROM users LIMIT 1") }),
  );
  const identity = z.object({
    name: z.string().min(1),
    email: z.email().transform((v) => v.toLowerCase()),
    password: z.string().min(12).max(200),
  });
  app.post("/api/v1/auth/setup", async (c) => {
    const body = await c.req.json();
    const data = identity.parse(body);
    const checkSetup = () => {
      if (
        get("SELECT 1 FROM users") ||
        typeof body.setupToken !== "string" ||
        digest(body.setupToken) !== digest(config.setupToken)
      )
        fail("Setup unavailable", 403);
    };
    checkSetup();
    const password = await passwordWork(() => {
      checkSetup();
      return Bun.password.hash(data.password, { algorithm: "argon2id" });
    });
    const user = db.transaction(() => {
      checkSetup();
      const user = { id: cryptoRandom(), ...data, role: "owner" };
      run(
        "INSERT INTO users VALUES(?,?,?,?,?)",
        user.id,
        user.name,
        user.email,
        password,
        user.role,
      );
      return user;
    })();
    return session(c, user);
  });
  app.post("/api/v1/auth/login", async (c) => {
    const body = z
      .object({
        email: z.email().transform((value) => value.toLowerCase()),
        password: z.string().max(200),
      })
      .parse(await c.req.json());
    checkAccountAttempts(c, body.email);
    const user = get("SELECT * FROM users WHERE email=?", body.email);
    if (
      !user ||
      !(await passwordWork(() =>
        Bun.password.verify(body.password, user.password),
      ))
    ) {
      log("warn", "auth.rejected", { reason: "invalid_credentials" });
      fail("Invalid credentials", 401);
    }
    // Password verification yields: a rotation or deletion may have committed.
    if (
      get("SELECT password FROM users WHERE id=?", user.id)?.password !==
      user.password
    )
      fail("Invalid credentials", 401);
    accountAttempts.clear(body.email);
    return session(c, user);
  });
  app.post("/api/v1/auth/accept-invite", async (c) => {
    const body = await c.req.json(),
      data = identity.parse(body);
    const checkInvite = () => {
      if (typeof body.invite !== "string")
        fail("Invitation invalid or expired", 403);
      const invite = get(
        "SELECT * FROM invites WHERE digest=? AND expires>?",
        digest(body.invite),
        Date.now(),
      );
      if (!invite) fail("Invitation invalid or expired", 403);
      if (get("SELECT 1 FROM users WHERE email=?", data.email))
        fail("Email already exists");
      return invite;
    };
    checkInvite();
    const password = await passwordWork(() => {
      checkInvite();
      return Bun.password.hash(data.password, { algorithm: "argon2id" });
    });
    const user = db.transaction(() => {
      const invite = checkInvite();
      const u = { id: cryptoRandom(), ...data, role: "collaborator" };
      run(
        "INSERT INTO users VALUES(?,?,?,?,?)",
        u.id,
        u.name,
        u.email,
        password,
        u.role,
      );
      run("DELETE FROM invites WHERE digest=?", invite.digest);
      return u;
    })();
    realtime(db).workspaceChanged();
    return session(c, user);
  });
  app.use("/api/v1/*", async (c, next) => {
    const path = c.req.path;
    if (
      path === "/api/v1/guest" ||
      path.startsWith("/api/v1/guest/") ||
      path.startsWith("/api/v1/public/") ||
      path.startsWith("/api/v1/auth/") ||
      path.endsWith("/health")
    )
      return next();
    const cookie = c.req
      .header("cookie")
      ?.match(/(?:^|; )oshost_session=([^;]+)/)?.[1];
    const s =
      cookie &&
      get(
        "SELECT s.*,u.id,u.name,u.email,u.role FROM sessions s JOIN users u ON s.user_id=u.id WHERE digest=? AND expires>?",
        digest(cookie),
        Date.now(),
      );
    if (!s) {
      log("warn", "auth.session_rejected");
      return c.json({ error: "Authentication required" }, 401);
    }
    setLogActor(s);
    if (c.req.method !== "GET" && c.req.header("x-csrf-token") !== s.csrf)
      return c.json({ error: "CSRF token rejected" }, 403);
    c.set("user", userView(s));
    c.set("csrf", s.csrf);
    await next();
  });
  app.use("/api/v1/*", async (c, next) => {
    const [resource, id, action] = c.req.path
      .slice("/api/v1/".length)
      .split("/");
    if (resource === "codes" && !["GET", "DELETE"].includes(c.req.method)) {
      if (id) {
        const row = get("SELECT data FROM codes WHERE id=?", id);
        if (row)
          permission(
            c,
            JSON.parse(row.data).staff === true
              ? "createStaffCodes"
              : "createAccessCodes",
          );
      }
      if ((!id || !action) && ["POST", "PUT"].includes(c.req.method)) {
        const body = await c.req.raw.clone().json();
        permission(
          c,
          body.staff === true ? "createStaffCodes" : "createAccessCodes",
        );
      }
    }
    if (
      resource === "connections" &&
      (c.req.method === "GET" || action === "request")
    )
      permission(c, "useBookingConnectors");
    await next();
  });
  function requireActiveProperty(id: string) {
    const property = get("SELECT data FROM properties WHERE id=?", id);
    if (!property) fail("Property missing", 404);
    if (JSON.parse(property.data).active === false)
      fail("Structure is deactivated", 403);
  }
  // Apply the same scope guard to host, public breakfast and connector routes.
  app.use("/api/v1/*", async (c, next) => {
    const parts = c.req.path.slice("/api/v1/".length).split("/");
    const [resource, id, action] = parts;
    if (
      resource === "properties" &&
      id &&
      action !== "status" &&
      c.req.method !== "DELETE"
    )
      requireActiveProperty(id);
    if (resource === "templates" && id) requireActiveProperty(id);
    if (resource === "public" && id === "breakfast" && action)
      requireActiveProperty(action);
    if (
      ["codes", "doors", "connections"].includes(resource) &&
      id &&
      id !== "order" &&
      c.req.method !== "DELETE"
    ) {
      const row = get(`SELECT property_id FROM ${resource} WHERE id=?`, id);
      if (row) requireActiveProperty(row.property_id);
    }
    if (
      ["codes", "doors", "connections"].includes(resource) &&
      ["POST", "PUT"].includes(c.req.method) &&
      (!id || id === "order")
    ) {
      const body = await c.req.raw.clone().json();
      if (typeof body.propertyId === "string")
        requireActiveProperty(body.propertyId);
    }
    await next();
  });
  function exclusiveMutation() {
    if (lifecycle.active !== 1)
      fail("Another operation is running. Please try again shortly.", 409);
  }
  app.patch("/api/v1/properties/:id/status", async (c) => {
    owner(c);
    const { active } = z
      .object({ active: z.boolean() })
      .strict()
      .parse(await c.req.json());
    exclusiveMutation();
    const id = c.req.param("id"),
      row = get("SELECT data FROM properties WHERE id=?", id);
    if (!row) fail("Property missing", 404);
    run(
      "UPDATE properties SET data=? WHERE id=?",
      JSON.stringify({ ...JSON.parse(row.data), active }),
      id,
    );
    realtime(db).workspaceChanged();
    return c.json({ ok: true });
  });
  app.delete("/api/v1/properties/:id", async (c) => {
    owner(c);
    z.object({ confirmation: z.literal("DELETE STRUCTURE") })
      .strict()
      .parse(await c.req.json());
    exclusiveMutation();
    const id = c.req.param("id");
    if (!get("SELECT 1 FROM properties WHERE id=?", id))
      fail("Property missing", 404);
    db.transaction(() => deleteProperty(db, id))();
    realtime(db).workspaceChanged();
    return c.json({ ok: true });
  });
  app.delete("/api/v1/codes/:id", async (c) => {
    owner(c);
    z.object({ confirmation: z.literal("DELETE CODE") })
      .strict()
      .parse(await c.req.json());
    exclusiveMutation();
    const id = c.req.param("id");
    if (!get("SELECT 1 FROM codes WHERE id=?", id)) fail("Code missing", 404);
    db.transaction(() => deleteCode(db, id))();
    realtime(db).workspaceChanged();
    return c.json({ ok: true });
  });
  app.get(
    "/api/v1/live",
    (c, next) => {
      if (c.req.header("origin") !== config.origin)
        return c.json({ error: "Origin rejected" }, 403);
      return next();
    },
    upgradeWebSocket((c) => {
      const session = digest(
        c.req.header("cookie")!.match(/(?:^|; )oshost_session=([^;]+)/)![1],
      );
      return {
        onOpen(_event, ws) {
          realtime(db).connect(ws, session);
        },
        onClose(_event, ws) {
          realtime(db).disconnect(ws);
        },
        onError(_event, ws) {
          realtime(db).disconnect(ws);
        },
      };
    }),
  );
  app.get("/api/v1/me", (c) =>
    c.json({ user: c.get("user"), csrf: c.get("csrf") }),
  );
  app.patch("/api/v1/me/preferences", async (c) => {
    const changes = z
      .object({
        tour: z.enum(["pending", "completed", "skipped"]).optional(),
        tourStep: z.enum(["install", "notifications"]).nullable().optional(),
        tourCodeId: z.string().uuid().nullable().optional(),
        language: z.enum(["en", "it"]).nullable().optional(),
        theme: z.enum(["light", "dark", "system"]).optional(),
      })
      .strict()
      .parse(await c.req.json());
    const preferences = { ...userView(c.get("user")).preferences, ...changes };
    run(
      "INSERT INTO user_preferences VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data",
      c.get("user").id,
      JSON.stringify(preferences),
    );
    return c.json({ preferences });
  });
  app.post("/api/v1/me/password", async (c) => {
    const input = z
      .object({
        currentPassword: z.string().max(200),
        newPassword: z.string().min(12).max(200),
      })
      .parse(await c.req.json());
    const user = get("SELECT * FROM users WHERE id=?", c.get("user").id);
    if (!user) fail("Authentication required", 401);
    checkAccountAttempts(c, user.email);
    const password = await passwordWork(async () => {
      if (!(await Bun.password.verify(input.currentPassword, user.password)))
        fail("Current password is incorrect", 403);
      if (input.newPassword === input.currentPassword)
        fail("Choose a different password");
      return Bun.password.hash(input.newPassword, { algorithm: "argon2id" });
    });
    db.transaction(() => {
      if (
        get("SELECT password FROM users WHERE id=?", user.id)?.password !==
          user.password ||
        !get(
          "SELECT 1 FROM sessions WHERE user_id=? AND csrf=? AND expires>?",
          user.id,
          c.get("csrf"),
          Date.now(),
        )
      )
        fail("Authentication required", 401);
      run("UPDATE users SET password=? WHERE id=?", password, user.id);
      run("DELETE FROM sessions WHERE user_id=?", user.id);
      accountAttempts.clear(user.email);
    })();
    realtime(db).heartbeat();
    log("info", "auth.password_changed");
    c.header(
      "Set-Cookie",
      `oshost_session=; Path=/api/; HttpOnly; SameSite=Strict; Max-Age=0${config.origin.startsWith("https:") ? "; Secure" : ""}`,
    );
    return c.json({ ok: true });
  });
  app.post("/api/v1/admin/wipe", async (c) => {
    owner(c);
    const input = z
      .object({
        password: z.string().max(200),
        confirmation: z.literal("WIPE ALL DATA"),
      })
      .parse(await c.req.json());
    const user = get("SELECT * FROM users WHERE id=?", c.get("user").id);
    if (
      !user ||
      !(await passwordWork(() =>
        Bun.password.verify(input.password, user.password),
      ))
    )
      fail("Current password is incorrect", 403);
    if (lifecycle.active !== 1)
      fail(
        "Another request or notification is in progress. Wait for it to finish before wiping the database.",
        409,
      );
    lifecycle.resetting = true;
    try {
      db.transaction(() => {
        for (const table of [
          "jobs",
          "event_reads",
          "subscriptions",
          "events",
          "breakfast_sessions",
          "property_settings",
          "code_metrics",
          "door_tests",
          "actions",
          "redemptions",
          "grants",
          "codes",
          "connections",
          "templates",
          "doors",
          "properties",
          "sessions",
          "invites",
          "user_preferences",
          "user_permissions",
          "users",
          "account_backoff",
        ])
          db.exec(`DELETE FROM ${table}`);
      })();
      log("warn", "workspace.wiped");
      buckets.clear();
      invalidAlerts.reset();
      c.header(
        "Set-Cookie",
        "oshost_session=; Path=/api/; HttpOnly; SameSite=Strict; Max-Age=0",
      );
      return c.json({ ok: true, needsSetup: true });
    } finally {
      lifecycle.resetting = false;
    }
  });
  app.post("/api/v1/logout", (c) => {
    run("DELETE FROM sessions WHERE user_id=?", c.get("user").id);
    c.header(
      "Set-Cookie",
      "oshost_session=; Path=/api/; HttpOnly; SameSite=Strict; Max-Age=0",
    );
    return c.json({ ok: true });
  });
  app.get("/api/v1/users", (c) => {
    owner(c);
    return c.json(all("SELECT id,name,email,role FROM users").map(userView));
  });
  app.patch("/api/v1/users/:id", async (c) => {
    owner(c);
    const input = z
      .object({
        role: z.literal("owner").optional(),
        permissions: collaboratorPermissionChangesSchema.optional(),
      })
      .strict()
      .refine(
        (v) => !!v.role !== !!v.permissions,
        "Choose promotion or permissions",
      )
      .parse(await c.req.json());
    const id = c.req.param("id"),
      target = get("SELECT * FROM users WHERE id=?", id);
    if (!target) fail("Account missing", 404);
    if (target.role === "owner")
      fail("Owner accounts cannot be changed by another account", 403);
    db.transaction(() => {
      if (input.role) {
        run("UPDATE users SET role='owner' WHERE id=?", id);
        run("DELETE FROM user_permissions WHERE user_id=?", id);
      } else {
        const permissions = collaboratorPermissionsSchema.parse({
          ...userView(target).permissions,
          ...input.permissions,
        });
        run(
          "INSERT INTO user_permissions VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data",
          id,
          JSON.stringify(permissions),
        );
      }
    })();
    realtime(db).accountChanged(id);
    realtime(db).workspaceChanged();
    return c.json(userView(get("SELECT * FROM users WHERE id=?", id)));
  });
  app.delete("/api/v1/users/:id", async (c) => {
    owner(c);
    z.object({ confirmation: z.literal("DELETE ACCOUNT") })
      .strict()
      .parse(await c.req.json());
    const id = c.req.param("id"),
      target = get("SELECT * FROM users WHERE id=?", id);
    if (!target) fail("Account missing", 404);
    if (target.role === "owner" && id !== c.get("user").id)
      fail("Owners can only delete their own accounts", 403);
    if (
      target.role === "owner" &&
      get("SELECT COUNT(*) count FROM users WHERE role='owner'").count <= 1
    )
      fail("Promote another owner before deleting your account", 409);
    // Notify active sessions before cascading their deletion; HTTP checks see the new state immediately.
    realtime(db).accountChanged(id);
    accountAttempts.clear(target.email);
    run("DELETE FROM users WHERE id=?", id);
    realtime(db).workspaceChanged();
    return c.json({ ok: true });
  });
  app.post("/api/v1/invites", (c) => {
    owner(c);
    const raw = token();
    run("INSERT INTO invites VALUES(?,?)", digest(raw), Date.now() + 86400000);
    return c.json({ link: `${config.origin}/host/#invite=${raw}` });
  });
  app.get("/api/v1/properties", (c) => {
    const includeInactive = c.req.query("includeInactive") === "1";
    if (includeInactive) owner(c);
    return c.json(
      all("SELECT * FROM properties")
        .filter((p) => includeInactive || JSON.parse(p.data).active !== false)
        .map((p) => ({
          active: true,
          id: p.id,
          ...JSON.parse(p.data),
          notificationRetentionMonths:
            get(
              "SELECT notification_months FROM property_settings WHERE property_id=?",
              p.id,
            )?.notification_months ?? 3,
          breakfastProtected: !!get(
            "SELECT breakfast_password FROM property_settings WHERE property_id=?",
            p.id,
          )?.breakfast_password,
        })),
    );
  });
  app.post("/api/v1/properties", async (c) => {
    owner(c);
    const data = propertySchema.parse({
        ...(await c.req.json()),
        active: true,
      }),
      id = cryptoRandom();
    run("INSERT INTO properties VALUES(?,?)", id, JSON.stringify(data));
    return c.json({ id, ...data }, 201);
  });
  app.put("/api/v1/properties/:id", async (c) => {
    owner(c);
    const current = get(
      "SELECT data FROM properties WHERE id=?",
      c.req.param("id"),
    );
    if (!current) fail("Property missing", 404);
    const data = propertySchema.parse({
      ...JSON.parse(current.data),
      ...(await c.req.json()),
      active: JSON.parse(current.data).active !== false,
    });
    run(
      "UPDATE properties SET data=? WHERE id=?",
      JSON.stringify(data),
      c.req.param("id"),
    );
    return c.json({ ok: true });
  });
  app.patch("/api/v1/properties/:id/links", async (c) => {
    owner(c);
    const links = guestLinksSchema.parse(await c.req.json());
    const current = get(
      "SELECT data FROM properties WHERE id=?",
      c.req.param("id"),
    );
    if (!current) fail("Property missing", 404);
    run(
      "UPDATE properties SET data=? WHERE id=?",
      JSON.stringify({ ...JSON.parse(current.data), ...links }),
      c.req.param("id"),
    );
    return c.json(links);
  });
  app.patch("/api/v1/properties/:id/notifications", async (c) => {
    const id = c.req.param("id");
    if (!get("SELECT 1 FROM properties WHERE id=?", id))
      fail("Property missing", 404);
    const { retentionMonths } = z
      .object({ retentionMonths: z.number().int().min(1).max(120) })
      .parse(await c.req.json());
    run(
      "INSERT INTO property_settings(property_id,notification_months) VALUES(?,?) ON CONFLICT(property_id) DO UPDATE SET notification_months=excluded.notification_months",
      id,
      retentionMonths,
    );
    pruneNotifications(db);
    return c.json({ retentionMonths });
  });
  breakfastAccessRoutes(
    app as any,
    db,
    config.origin,
    owner,
    fail,
    passwordWork,
  );
  const doorView = (d: any) => {
    const data = JSON.parse(d.data);
    const test = get(
      "SELECT * FROM door_tests WHERE door_id=? AND resolved=0 ORDER BY created DESC LIMIT 1",
      d.id,
    );
    return {
      id: d.id,
      enabled: true,
      description: "",
      descriptionTranslations: {},
      photos: [],
      primaryPhotoId: null,
      order: 0,
      ...data,
      configured: data.integration !== "none",
      testAction: test ? { id: test.id, ...JSON.parse(test.result) } : null,
    };
  };
  app.get("/api/v1/doors", (c) =>
    c.json(
      all(
        "SELECT * FROM doors WHERE property_id IN (SELECT id FROM properties WHERE json_extract(data,'$.active') IS NOT 0)",
      )
        .map(doorView)
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    ),
  );
  app.put("/api/v1/doors/order", async (c) => {
    owner(c);
    const b = z
      .object({ propertyId: z.string(), doorIds: z.array(z.string()) })
      .parse(await c.req.json());
    const doors = all("SELECT * FROM doors WHERE property_id=?", b.propertyId);
    if (
      new Set(b.doorIds).size !== doors.length ||
      b.doorIds.length !== doors.length ||
      doors.some((d) => !b.doorIds.includes(d.id))
    )
      fail("Include every door in the property exactly once");
    db.transaction(() => {
      for (const [order, id] of b.doorIds.entries()) {
        const d = doors.find((d) => d.id === id);
        run(
          "UPDATE doors SET data=? WHERE id=?",
          JSON.stringify({ ...JSON.parse(d.data), order }),
          id,
        );
      }
    })();
    return c.json({ ok: true });
  });
  app.post("/api/v1/doors", async (c) => {
    permission(c, "createDoors");
    const { config: secret, ...data } = doorSchema.parse(await c.req.json());
    validateDoorPhotos(data);
    validateDevice(data.integration, secret);
    const id = cryptoRandom();
    run(
      "INSERT INTO doors VALUES(?,?,?,?)",
      id,
      data.propertyId,
      JSON.stringify(data),
      crypto.seal(secret),
    );
    return c.json({ id, ...data }, 201);
  });
  app.put("/api/v1/doors/:id", async (c) => {
    owner(c);
    const input = await c.req.json();
    const d = get("SELECT * FROM doors WHERE id=?", c.req.param("id"));
    if (!d) fail("Door missing", 404);
    const current = JSON.parse(d.data);
    const { config: secret, ...data } = doorSchema.parse({
      ...current,
      ...input,
    });
    if (current.propertyId !== data.propertyId)
      fail("A door cannot move between properties");
    const use =
      data.integration === "none"
        ? secret
        : Object.keys(secret).length
          ? secret
          : crypto.open(d.secret);
    validateDoorPhotos(data);
    validateDevice(data.integration, use);
    run(
      "UPDATE doors SET data=?,secret=? WHERE id=?",
      JSON.stringify(data),
      crypto.seal(use),
      d.id,
    );
    return c.json({ ok: true });
  });
  function validateDoorPhotos(data: any) {
    if (new Set(data.photos.map((p: any) => p.id)).size !== data.photos.length)
      fail("Duplicate photo identifiers");
    if (
      data.primaryPhotoId &&
      !data.photos.some((p: any) => p.id === data.primaryPhotoId)
    )
      fail("Primary photo is missing");
    for (const photo of data.photos) {
      const bytes = Buffer.from(photo.url.split(",")[1], "base64");
      const valid = photo.url.startsWith("data:image/png;")
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : photo.url.startsWith("data:image/jpeg;")
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : bytes.subarray(0, 4).toString() === "RIFF" &&
            bytes.subarray(8, 12).toString() === "WEBP";
      if (!valid) fail("Only PNG, JPEG and WebP photo data is allowed");
    }
  }
  app.delete("/api/v1/doors/:id", (c) => {
    owner(c);
    const d = get("SELECT * FROM doors WHERE id=?", c.req.param("id"));
    if (!d) fail("Door missing", 404);
    if (get("SELECT 1 FROM grants WHERE door_id=?", d.id))
      fail(
        "This door is used by access codes. Disable it to preserve their history.",
        409,
      );
    if (get("SELECT 1 FROM door_tests WHERE door_id=? AND resolved=0", d.id))
      fail("Resolve the door test before deleting this door", 409);
    run("DELETE FROM doors WHERE id=?", d.id);
    event(
      "door.deleted",
      `Door deleted: ${JSON.parse(d.data).name}`,
      d.property_id,
      null,
      { doorName: JSON.parse(d.data).name },
    );
    return c.json({ ok: true });
  });
  app.post("/api/v1/doors/:id/test", async (c) => {
    owner(c);
    z.object({ confirm: z.literal(true) }).parse(await c.req.json());
    const id = actionId(c),
      doorId = c.req.param("id");
    const prior = get("SELECT * FROM door_tests WHERE id=?", id);
    if (prior) {
      if (prior.door_id !== doorId || prior.user_id !== c.get("user").id)
        fail("Idempotency key conflict", 409);
      return c.json({ id, ...JSON.parse(prior.result) });
    }
    const d = get("SELECT * FROM doors WHERE id=?", doorId);
    if (!d) fail("Door missing", 404);
    const data = JSON.parse(d.data);
    if (data.enabled === false) fail("Door disabled", 403);
    if (data.integration === "none")
      fail("This door has no device connector yet", 400);
    if (get("SELECT 1 FROM door_tests WHERE door_id=? AND resolved=0", doorId))
      fail(
        "A previous test is pending or uncertain. Check the door and resolve it before another test.",
        409,
      );
    run(
      "INSERT INTO door_tests(id,door_id,user_id,result,created) VALUES(?,?,?,?,?)",
      id,
      doorId,
      c.get("user").id,
      JSON.stringify({
        status: "pending",
        detail: "Device request in progress",
      }),
      new Date().toISOString(),
    );
    let result;
    try {
      result = await device(data.integration, crypto.open(d.secret));
    } catch {
      result = {
        status: "uncertain",
        detail: "Device response unavailable; check the door before retrying",
      };
    }
    db.transaction(() => {
      run(
        "UPDATE door_tests SET result=?,resolved=? WHERE id=?",
        JSON.stringify(result),
        Number(result.status !== "uncertain"),
        id,
      );
      event(
        "device.test." + result.status,
        `${c.get("user").name} tested ${data.name}: ${result.detail}`,
        d.property_id,
        null,
        {
          actor: c.get("user").name,
          doorName: data.name,
          detail: result.detail,
        },
      );
    })();
    return c.json({ id, ...result });
  });
  app.post("/api/v1/doors/:id/resolve-test", async (c) => {
    owner(c);
    const b = z
      .object({ actionId: z.string(), confirm: z.literal(true) })
      .parse(await c.req.json());
    const action = get(
      "SELECT * FROM door_tests WHERE id=? AND door_id=?",
      b.actionId,
      c.req.param("id"),
    );
    if (!action) fail("Door test missing", 404);
    if (JSON.parse(action.result).status === "pending")
      fail("Device request is still running", 409);
    if (action.resolved) return c.json({ ok: true });
    run("UPDATE door_tests SET resolved=1 WHERE id=?", action.id);
    const d = get("SELECT * FROM doors WHERE id=?", action.door_id);
    event(
      "device.test.resolved",
      `${c.get("user").name} checked the uncertain door test`,
      d?.property_id,
      null,
      { actor: c.get("user").name },
    );
    return c.json({ ok: true });
  });
  function validateDevice(kind: string, s: any) {
    if (kind === "none" && Object.keys(s).length)
      fail("An unconnected door must not contain device credentials");
    if (kind === "ewelink" && !s.webhook_code) fail("Webhook code required");
    if (
      kind === "shelly" &&
      (!/^shelly-[a-z0-9-]+\.shelly\.cloud$/.test(s.host) ||
        !s.device_id ||
        !s.api_key)
    )
      fail("Shelly cloud host, device ID and API key required");
  }
  portableBackupRoutes(app, db, config.key, owner, validateDevice);
  const codeView = (row: any) => ({
    id: row.id,
    staff: false,
    ...JSON.parse(row.data),
    revoked: !!row.revoked,
    created: row.created,
    creator: row.creator,
    creatorName:
      get("SELECT name FROM users WHERE id=?", row.creator)?.name ??
      JSON.parse(row.data).importedCreatorName ??
      null,
    link: `${config.origin}/guest/#code=${crypto.open(row.secret)}`,
    grants: all(
      "SELECT door_id AS doorId,start,end,single_use AS singleUse,used,claim,active FROM grants WHERE code_id=?",
      row.id,
    ).map((g) => ({ ...g, singleUse: !!g.singleUse, active: !!g.active })),
    breakfastUsed: get(
      "SELECT COALESCE(SUM(quantity),0) AS n FROM redemptions WHERE code_id=?",
      row.id,
    ).n,
  });
  app.get("/api/v1/codes", (c) =>
    c.json(
      all(
        "SELECT * FROM codes WHERE property_id IN (SELECT id FROM properties WHERE json_extract(data,'$.active') IS NOT 0) ORDER BY created DESC",
      ).map(codeView),
    ),
  );
  function saveCode(data: any, id: string, userId: string, isNew: boolean) {
    if (data.staff)
      data = {
        ...data,
        grants: data.grants.map((g: any) => ({
          ...g,
          start: STAFF_ACCESS_START,
          end: STAFF_ACCESS_END,
        })),
      };
    db.transaction(() => {
      if (!get("SELECT 1 FROM properties WHERE id=?", data.propertyId))
        fail("Property missing");
      if (
        new Set(data.grants.map((g: any) => g.doorId)).size !==
        data.grants.length
      )
        fail("Duplicate door");
      for (const g of data.grants) {
        if (
          !get(
            "SELECT 1 FROM doors WHERE id=? AND property_id=?",
            g.doorId,
            data.propertyId,
          )
        )
          fail("Door is outside this property");
        const old = get(
          "SELECT * FROM grants WHERE code_id=? AND door_id=?",
          id,
          g.doorId,
        );
        if (old?.claim)
          fail("Resolve pending device action before editing this code", 409);
      }
      const used = get(
        "SELECT COALESCE(SUM(quantity),0) AS n FROM redemptions WHERE code_id=?",
        id,
      ).n;
      if (used > (data.breakfast?.total ?? 0))
        fail("Allocation cannot be below breakfasts already used");
      const old = get("SELECT * FROM codes WHERE id=?", id);
      if (!isNew && !old) fail("Code missing", 404);
      if (old && old.property_id !== data.propertyId)
        fail("Create a new access code to use another property");
      if (
        old &&
        all("SELECT * FROM grants WHERE code_id=? AND claim IS NOT NULL", id)
          .length
      )
        fail("Resolve pending device action first", 409);
      const { grants, ...record } = data;
      if (old && JSON.parse(old.data).importedCreatorName)
        record.importedCreatorName = JSON.parse(old.data).importedCreatorName;
      if (old && JSON.parse(old.data).importedCreatorId)
        record.importedCreatorId = JSON.parse(old.data).importedCreatorId;
      if (isNew) {
        const raw = token();
        run(
          "INSERT INTO codes(id,property_id,creator,digest,secret,data,created) VALUES(?,?,?,?,?,?,?)",
          id,
          data.propertyId,
          userId,
          digest(raw),
          crypto.seal(raw),
          JSON.stringify(record),
          new Date().toISOString(),
        );
      } else
        run(
          "UPDATE codes SET data=?,property_id=? WHERE id=?",
          JSON.stringify(record),
          data.propertyId,
          id,
        );
      const prior = all("SELECT * FROM grants WHERE code_id=?", id);
      run("DELETE FROM grants WHERE code_id=?", id);
      for (const g of grants)
        run(
          "INSERT INTO grants(code_id,door_id,start,end,single_use,used,active) VALUES(?,?,?,?,?,?,?)",
          id,
          g.doorId,
          g.start,
          g.end,
          Number(g.singleUse),
          prior.find((v) => v.door_id === g.doorId)?.used ?? 0,
          Number(
            g.active ??
              Boolean(prior.find((v) => v.door_id === g.doorId)?.active ?? 1),
          ),
        );
      event(
        isNew ? "code.created" : "code.updated",
        isNew ? "Access code created" : "Access code updated",
        data.propertyId,
        id,
        {
          actor: get("SELECT name FROM users WHERE id=?", userId)?.name,
          validFrom:
            !data.staff && grants.length
              ? grants.map((g: { start: string }) => g.start).sort()[0]
              : undefined,
          validTo:
            !data.staff && grants.length
              ? grants
                  .map((g: { end: string }) => g.end)
                  .sort()
                  .at(-1)
              : undefined,
          timezone: JSON.parse(
            get("SELECT data FROM properties WHERE id=?", data.propertyId).data,
          ).timezone,
        },
      );
    })();
  }
  app.post("/api/v1/codes", async (c) => {
    const id = cryptoRandom();
    saveCode(
      codeInputSchema.parse(await c.req.json()),
      id,
      c.get("user").id,
      true,
    );
    return c.json(codeView(get("SELECT * FROM codes WHERE id=?", id)), 201);
  });
  app.put("/api/v1/codes/:id", async (c) => {
    saveCode(
      codeInputSchema.parse(await c.req.json()),
      c.req.param("id"),
      c.get("user").id,
      false,
    );
    return c.json({ ok: true });
  });
  app.patch("/api/v1/codes/:id/grants/:doorId", async (c) => {
    const b = z.object({ active: z.boolean() }).parse(await c.req.json());
    const code = get("SELECT * FROM codes WHERE id=?", c.req.param("id"));
    const grant = get(
      "SELECT * FROM grants WHERE code_id=? AND door_id=?",
      c.req.param("id"),
      c.req.param("doorId"),
    );
    if (!code || !grant) fail("Door permission missing", 404);
    if (grant.claim)
      fail(
        "Resolve pending device action before changing this permission",
        409,
      );
    run(
      "UPDATE grants SET active=? WHERE code_id=? AND door_id=?",
      Number(b.active),
      code.id,
      grant.door_id,
    );
    event(
      "code.permission",
      b.active ? "Door permission resumed" : "Door permission paused",
      code.property_id,
      code.id,
    );
    return c.json({ ok: true });
  });
  app.post("/api/v1/codes/:id/revoke", (c) => {
    const r = get("SELECT * FROM codes WHERE id=?", c.req.param("id"));
    if (!r) fail("Code missing", 404);
    run("UPDATE codes SET revoked=1 WHERE id=?", r.id);
    event("code.revoked", "Access code revoked", r.property_id, r.id);
    return c.json({ ok: true });
  });
  app.post("/api/v1/codes/:id/regenerate", (c) => {
    const raw = token();
    run(
      "UPDATE codes SET digest=?,secret=? WHERE id=?",
      digest(raw),
      crypto.seal(raw),
      c.req.param("id"),
    );
    const code = get("SELECT * FROM codes WHERE id=?", c.req.param("id"));
    if (code)
      event("code.updated", "Guest link replaced", code.property_id, code.id);
    return c.json({ ok: true });
  });
  app.post("/api/v1/codes/:id/resolve", async (c) => {
    const b = z
      .object({ doorId: z.string(), consumed: z.boolean() })
      .parse(await c.req.json());
    db.transaction(() => {
      const g = get(
        "SELECT * FROM grants WHERE code_id=? AND door_id=?",
        c.req.param("id"),
        b.doorId,
      );
      if (!g?.claim) fail("No uncertain action to resolve");
      const action = get("SELECT * FROM actions WHERE id=?", g.claim);
      if (action && JSON.parse(action.result).status === "pending")
        fail("Device request is still running", 409);
      run(
        "UPDATE grants SET claim=NULL,used=used+? WHERE code_id=? AND door_id=?",
        Number(b.consumed),
        g.code_id,
        g.door_id,
      );
      event(
        "device.resolved",
        `Host resolved uncertain action as ${b.consumed ? "consumed" : "retry permitted"}`,
        get("SELECT property_id FROM codes WHERE id=?", g.code_id).property_id,
        g.code_id,
      );
    })();
    return c.json({ ok: true });
  });
  app.get("/api/v1/templates/:property", (c) =>
    c.json(
      JSON.parse(
        get(
          "SELECT data FROM templates WHERE property_id=?",
          c.req.param("property"),
        )?.data ?? JSON.stringify(defaultTemplates),
      ),
    ),
  );
  app.put("/api/v1/templates/:property", async (c) => {
    const data = z
      .record(z.string(), z.record(z.string(), z.string().max(10000)))
      .parse(await c.req.json());
    run(
      "INSERT INTO templates VALUES(?,?) ON CONFLICT(property_id) DO UPDATE SET data=excluded.data",
      c.req.param("property"),
      JSON.stringify(data),
    );
    return c.json({ ok: true });
  });
  app.get("/api/v1/events/unread", (c) => {
    pruneNotifications(db);
    return c.json(reads.unread(c.get("user").id));
  });
  app.post("/api/v1/events/read", async (c) => {
    const input = z
      .object({ eventIds: z.array(z.uuid()).min(1).max(100) })
      .strict()
      .parse(await c.req.json());
    const id = c.get("user").id;
    const changed = reads.mark(id, input.eventIds);
    if (changed) realtime(db).notificationReads(id);
    return c.json({ changed, unread: reads.unread(id) });
  });
  app.post("/api/v1/events/read-all", async (c) => {
    const input = z
      .object({ propertyId: z.uuid().optional() })
      .strict()
      .parse(await c.req.json());
    const id = c.get("user").id;
    const changed = reads.markAll(id, input.propertyId);
    if (changed) realtime(db).notificationReads(id);
    return c.json({ changed, unread: reads.unread(id) });
  });
  app.get("/api/v1/events", (c) => {
    pruneNotifications(db);
    const paged = c.req.query("pageSize") !== undefined;
    const limit = paged
      ? z.coerce.number().int().min(1).max(100).parse(c.req.query("pageSize"))
      : 1000;
    const propertyId = c.req.query("propertyId");
    const clauses: string[] = [
        "(property_id IS NULL OR property_id IN (SELECT id FROM properties WHERE json_extract(data,'$.active') IS NOT 0))",
      ],
      args: any[] = [];
    if (propertyId) {
      z.string().uuid().parse(propertyId);
      clauses.push("(property_id=? OR property_id IS NULL)");
      args.push(propertyId);
    }
    if (c.req.query("cursor")) {
      let cursor: { created: string; id: string };
      try {
        cursor = z
          .object({ created: z.iso.datetime(), id: z.string().uuid() })
          .parse(
            JSON.parse(
              Buffer.from(c.req.query("cursor")!, "base64url").toString(),
            ),
          );
      } catch {
        return c.json({ error: "Invalid history cursor" }, 400);
      }
      clauses.push("(created<? OR (created=? AND id<?))");
      args.push(cursor.created, cursor.created, cursor.id);
    }
    const rows = all(
      "SELECT * FROM events" +
        (clauses.length ? " WHERE " + clauses.join(" AND ") : "") +
        " ORDER BY created DESC,id DESC LIMIT ?",
      ...args,
      limit + 1,
    );
    const events = rows.slice(0, limit).map((row) => {
        const readBy = all(
          "SELECT user_id FROM event_reads WHERE event_id=?",
          row.id,
        ).map((r) => r.user_id);
        return {
          ...row,
          readBy,
          read: readBy.includes(c.get("user").id),
          context: JSON.parse(
            get("SELECT data FROM event_context WHERE event_id=?", row.id)
              ?.data ?? "{}",
          ),
        };
      }),
      last = events.at(-1);
    const nextCursor =
      rows.length > limit && last
        ? Buffer.from(
            JSON.stringify({ created: last.created, id: last.id }),
          ).toString("base64url")
        : null;
    return c.json(paged ? { events, nextCursor } : events);
  });
  app.get("/api/v1/reports", (c) =>
    c.json(
      all(
        "SELECT c.id,COALESCE(c.creator,json_extract(c.data,'$.importedCreatorId')) creator,COALESCE(u.name,json_extract(c.data,'$.importedCreatorName')) name,c.created,c.property_id,COALESCE(m.attempts,0) attempts,COALESCE(m.accepted,0) accepted FROM codes c LEFT JOIN users u ON c.creator=u.id LEFT JOIN code_metrics m ON m.code_id=c.id WHERE c.property_id IN (SELECT id FROM properties WHERE json_extract(data,'$.active') IS NOT 0)",
      ),
    ),
  );
  function guest(c: any) {
    const raw = c.req.header("authorization")?.replace(/^Bearer /, "") ?? "";
    const r = get("SELECT * FROM codes WHERE digest=?", digest(raw));
    if (r) requireActiveProperty(r.property_id);
    if (!r || r.revoked) {
      const budget = invalidAlerts.take(
        digest(c.env?.clientIP ?? "unknown"),
        r?.id,
      );
      if (budget.summary)
        event(
          "access.invalid",
          `${budget.summary} invalid-link attempts suppressed`,
          null,
          null,
          { suppressedAttempts: budget.summary },
        );
      if (budget.allowed) {
        let previousVisit: NotificationContext["previousVisit"];
        const hint = c.req.header("X-Oshost-Previous-Visit");
        if (hint && hint.length <= 2048) {
          try {
            const value = z
              .object({
                label: z.string().trim().min(1).max(120),
                date: z.iso.datetime(),
              })
              .parse(JSON.parse(decodeURIComponent(hint)));
            previousVisit = {
              label: value.label.replace(/[\x00-\x1f\x7f]/g, ""),
              date: value.date,
            };
          } catch {
            /* Untrusted, optional browser hint; never authorizes or attributes a structure. */
          }
        }
        event(
          "access.invalid",
          "An invalid or revoked guest link was attempted",
          r?.property_id ?? null,
          r?.id ?? null,
          {
            action: c.req.path.endsWith("/open")
              ? "door"
              : c.req.path.endsWith("/breakfast")
                ? "breakfast"
                : "page",
            ...(previousVisit ? { previousVisit } : {}),
          },
        );
      }
      fail("Invalid or revoked access link", 403);
    }
    requireActiveProperty(r.property_id);
    setLogResource({ codeId: r.id, propertyId: r.property_id });
    return r;
  }
  app.get("/api/v1/guest", (c) => {
    const r = guest(c),
      d = JSON.parse(r.data),
      p = JSON.parse(
        get("SELECT data FROM properties WHERE id=?", r.property_id).data,
      );
    return c.json({
      codeId: r.id,
      staff: d.staff === true,
      label: d.label,
      property: p.name,
      timezone: p.timezone,
      breakfast: d.breakfast,
      breakfastUsed: get(
        "SELECT COALESCE(SUM(quantity),0) AS n FROM redemptions WHERE code_id=?",
        r.id,
      ).n,
      doors: all(
        "SELECT g.*,d.data FROM grants g JOIN doors d ON d.id=g.door_id WHERE code_id=?",
        r.id,
      )
        .map((g) => ({
          id: g.door_id,
          timeUnrestricted: d.staff === true,
          name: JSON.parse(g.data).name,
          translations: JSON.parse(g.data).translations,
          description: JSON.parse(g.data).description ?? "",
          descriptionTranslations:
            JSON.parse(g.data).descriptionTranslations ?? {},
          photos: JSON.parse(g.data).photos ?? [],
          primaryPhotoId: JSON.parse(g.data).primaryPhotoId ?? null,
          order: JSON.parse(g.data).order ?? 0,
          enabled: JSON.parse(g.data).enabled !== false,
          active: !!g.active,
          start: g.start,
          end: g.end,
          singleUse: !!g.single_use,
          used: g.used,
          pending: !!g.claim,
          configured: JSON.parse(g.data).integration !== "none",
        }))
        .sort((a, b) => a.order - b.order),
    });
  });
  function actionId(c: any) {
    const id = c.req.header("idempotency-key");
    if (!id || !z.uuid().safeParse(id).success)
      fail("UUID Idempotency-Key required");
    return id!;
  }
  app.post("/api/v1/guest/doors/:door/open", async (c) => {
    const r = guest(c),
      id = actionId(c),
      doorId = c.req.param("door");
    const previous = get("SELECT * FROM actions WHERE id=?", id);
    if (previous) {
      if (
        previous.code_id !== r.id ||
        previous.target !== doorId ||
        previous.kind !== "door"
      )
        fail("Idempotency key conflict", 409);
      return c.json(JSON.parse(previous.result));
    }
    const d = get("SELECT * FROM doors WHERE id=?", doorId);
    try {
      db.transaction(() => {
        const g = get(
          "SELECT * FROM grants WHERE code_id=? AND door_id=?",
          r.id,
          doorId,
        );
        const now = new Date().toISOString();
        let reason =
          !g || !d
            ? "Door not permitted"
            : JSON.parse(d.data).enabled === false
              ? "Door disabled"
              : !g.active
                ? "Door permission paused"
                : JSON.parse(d.data).integration === "none"
                  ? "This door has no device connector yet"
                  : JSON.parse(r.data).staff !== true && now < g.start
                    ? "Access is not yet valid"
                    : JSON.parse(r.data).staff !== true && now >= g.end
                      ? "Access expired"
                      : g.claim
                        ? "Previous action is unresolved"
                        : g.single_use && g.used
                          ? "Single-use access already consumed"
                          : null;
        if (reason) {
          fail(reason, 403);
        }
        run(
          "INSERT INTO actions VALUES(?,?,?,?,?)",
          id,
          r.id,
          "door",
          doorId,
          JSON.stringify({ status: "pending" }),
        );
        run(
          "UPDATE grants SET claim=? WHERE code_id=? AND door_id=?",
          id,
          r.id,
          doorId,
        );
      })();
    } catch (e) {
      event("access.denied", (e as Error).message, r.property_id, r.id);
      throw e;
    }
    let result;
    try {
      result = await device(
        JSON.parse(d.data).integration,
        crypto.open(d.secret),
      );
    } catch {
      result = { status: "uncertain", detail: "Device response unavailable" };
    }
    db.transaction(() => {
      run("UPDATE actions SET result=? WHERE id=?", JSON.stringify(result), id);
      if (result.status !== "uncertain")
        run(
          "UPDATE grants SET claim=NULL,used=used+? WHERE code_id=? AND door_id=?",
          Number(result.status === "accepted"),
          r.id,
          doorId,
        );
      event("access." + result.status, result.detail, r.property_id, r.id);
    })();
    return c.json(result);
  });
  app.post("/api/v1/guest/breakfast", async (c) => {
    const { quantity } = z
      .object({ quantity: z.number().int().min(1).max(1000) })
      .parse(await c.req.json());
    const r = guest(c),
      id = actionId(c);
    let error: string | undefined;
    const result = db.transaction(() => {
      const prior = get("SELECT * FROM actions WHERE id=?", id);
      if (prior) {
        if (
          prior.code_id !== r.id ||
          prior.kind !== "breakfast" ||
          prior.target !== String(quantity)
        )
          fail("Idempotency key conflict", 409);
        return JSON.parse(prior.result);
      }
      const d = JSON.parse(r.data),
        p = JSON.parse(
          get("SELECT data FROM properties WHERE id=?", r.property_id).data,
        ),
        today = localDate(p.timezone),
        used = get(
          "SELECT COALESCE(SUM(quantity),0) AS n FROM redemptions WHERE code_id=?",
          r.id,
        ).n;
      if (
        !d.breakfast ||
        today < d.breakfast.start ||
        today > d.breakfast.end ||
        used + quantity > d.breakfast.total
      ) {
        error = "Breakfast unavailable for this date or quantity";
        event("breakfast.denied", error, r.property_id, r.id);
        return null;
      }
      run(
        "INSERT INTO redemptions VALUES(?,?,?,?,?)",
        id,
        r.id,
        quantity,
        today,
        new Date().toISOString(),
      );
      const result = { remaining: d.breakfast.total - used - quantity };
      run(
        "INSERT INTO actions VALUES(?,?,?,?,?)",
        id,
        r.id,
        "breakfast",
        String(quantity),
        JSON.stringify(result),
      );
      event(
        "breakfast.redeemed",
        `${quantity} breakfast(s) redeemed`,
        r.property_id,
        r.id,
      );
      return result;
    })();
    if (error) fail(error, 403);
    return c.json(result);
  });
  app.get("/api/v1/public/breakfast/:property", (c) => {
    const p = get(
      "SELECT * FROM properties WHERE id=?",
      c.req.param("property"),
    );
    if (!p) fail("Property missing", 404);
    if (!mayReadBreakfast(db, p.id, c.req.header("cookie")))
      return c.json(
        { error: "Breakfast page password required", requiresPassword: true },
        401,
      );
    const data = JSON.parse(p.data),
      today = localDate(data.timezone),
      month = today.slice(0, 7) + "-01",
      last = new Date(month + "T12:00:00Z");
    last.setUTCMonth(last.getUTCMonth() - 1);
    const lastStart = last.toISOString().slice(0, 10);
    const total = (from: string, to: string) =>
      get(
        "SELECT COALESCE(SUM(r.quantity),0) AS total FROM redemptions r JOIN codes c ON r.code_id=c.id WHERE c.property_id=? AND r.date>=? AND r.date<=?",
        p.id,
        from,
        to,
      ).total;
    const from = z.iso.date().parse(c.req.query("from") ?? month),
      to = z.iso.date().parse(c.req.query("to") ?? today);
    if (from > to) fail("Invalid date range");
    return c.json({
      property: data.name,
      timezone: data.timezone,
      today: total(today, today),
      thisMonth: total(month, today),
      lastMonth: total(
        lastStart,
        new Date(Date.parse(month + "T12:00:00Z") - 86400000)
          .toISOString()
          .slice(0, 10),
      ),
      from,
      to,
      total: total(from, to),
    });
  });
  app.get("/api/v1/push/key", (c) =>
    c.json({ key: process.env.VAPID_PUBLIC_KEY ?? null }),
  );
  app.post("/api/v1/push/subscriptions", async (c) => {
    const b = z
      .object({
        subscription: z.object({
          endpoint: z.url(),
          keys: z.object({ p256dh: z.string(), auth: z.string() }),
        }),
        properties: z.array(z.string()).default([]),
        events: z.array(z.string()).default([]),
        language: z.enum(["en", "it"]).default("en"),
        allEvents: z.boolean().optional(),
        allProperties: z.boolean().optional(),
      })
      .parse(await c.req.json());
    const u = new URL(b.subscription.endpoint);
    if (
      u.protocol !== "https:" ||
      ![
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "web.push.apple.com",
      ].some((h) => u.hostname === h || u.hostname.endsWith("." + h))
    )
      fail("Unsupported push endpoint");
    const id = digest(b.subscription.endpoint);
    run(
      "INSERT INTO subscriptions VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,data=excluded.data,preferences=excluded.preferences",
      id,
      c.get("user").id,
      JSON.stringify(b.subscription),
      JSON.stringify({
        properties: b.properties,
        events: b.events,
        language: b.language,
        allEvents: b.allEvents,
        allProperties: b.allProperties,
      }),
    );
    return c.json({ ok: true });
  });
  app.get("/api/v1/push/subscriptions", (c) =>
    c.json(
      all(
        "SELECT id,preferences FROM subscriptions WHERE user_id=?",
        c.get("user").id,
      ).map((row) => ({ id: row.id, ...JSON.parse(row.preferences) })),
    ),
  );
  app.delete("/api/v1/push/subscriptions", async (c) => {
    const input = z.object({ endpoint: z.url() }).parse(await c.req.json());
    run(
      "DELETE FROM subscriptions WHERE user_id=? AND id=?",
      c.get("user").id,
      digest(input.endpoint),
    );
    return c.json({ ok: true });
  });
  connectorRoutes(app as any, db, crypto, owner, fail);
  // Interrupted requests are never replayed after restart. Claims require host resolution.
  run(
    `UPDATE actions SET result=? WHERE result=?`,
    JSON.stringify({
      status: "uncertain",
      detail: "Server restarted during device request; verify before retrying",
    }),
    JSON.stringify({ status: "pending" }),
  );
  run(
    `UPDATE door_tests SET result=? WHERE resolved=0 AND json_extract(result,'$.status')='pending'`,
    JSON.stringify({
      status: "uncertain",
      detail:
        "Server restarted during door test; check the door before retrying",
    }),
  );
  return app;
}
