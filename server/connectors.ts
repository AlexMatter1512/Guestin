import type { Hono } from "hono";
import type { DB } from "./db";
import { log } from "./log";
import { z } from "zod";
import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
class CalendarError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function publicURL(raw: string) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new CalendarError("Enter a valid public HTTPS calendar URL.");
  }
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443")
  )
    throw new CalendarError(
      "Calendar URL must use HTTPS on port 443 without embedded credentials.",
    );
  let addresses;
  try {
    addresses = await lookup(u.hostname, { all: true });
  } catch {
    throw new CalendarError(
      "The calendar host could not be reached. Check the URL and DNS, then try again.",
      502,
    );
  }
  if (
    !addresses.length ||
    addresses.some((a) => ipaddr.process(a.address).range() !== "unicast")
  )
    throw new CalendarError(
      "Private and reserved calendar destinations are blocked. Use a public calendar URL.",
    );
  return u;
}
export async function boundedFetch(
  url: string,
  init: RequestInit = {},
  limit = 4 * 1024 * 1024,
) {
  const r = await fetch(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (!r.body) return { status: r.status, text: "" };
  const reader = r.body.getReader();
  let n = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      n += value.length;
      if (n > limit) throw Error("Provider response too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return { status: r.status, text: Buffer.concat(chunks).toString() };
}
const krossPaths = new Set([
  "/auth/get-token",
  "/properties/get-list",
  "/app/search-reservation",
  "/app/get-reservation",
  "/app/dashboard-arrivals",
  "/app/dashboard-departures",
  "/app/dashboard-stays",
  "/app/dashboard-booked",
]);
export function connectorRoutes(
  app: Hono<any>,
  db: DB,
  crypto: any,
  owner: (c: any) => void,
  fail: (s: string, n?: number) => never,
) {
  const get = (id: string) =>
    db.query("SELECT * FROM connections WHERE id=?").get(id) as any;
  app.get("/api/v1/connections", (c) =>
    c.json(
      (db.query("SELECT * FROM connections").all() as any[]).map((row) => {
        const { secret: encrypted, ...safe } = row;
        const data = JSON.parse(row.data);
        if (row.kind === "kross") {
          // Report state, never the bearer token. Do not trust a client-authored
          // `authenticated` flag from connection metadata.
          return {
            ...safe,
            data: {
              hotelId: data.hotelId ?? "",
              deviceId: data.deviceId ?? "",
              expiry: data.expiry ?? null,
              authenticated: !!crypto.open(encrypted).token,
            },
          };
        }
        return { ...safe, data };
      }),
    ),
  );
  app.post("/api/v1/connections", async (c) => {
    owner(c);
    const b = z
      .object({
        propertyId: z.string(),
        kind: z.enum(["kross", "ical", "gemini"]),
        name: z.string().min(1),
        secret: z.record(z.string(), z.unknown()),
        data: z.record(z.string(), z.unknown()).default({}),
      })
      .parse(await c.req.json());
    if (b.kind === "ical") await publicURL(String(b.secret.url));
    if (b.kind === "kross") {
      if (Object.keys(b.secret).some((key) => key !== "token"))
        fail("Only a Kross token can be stored. Passwords cannot be stored.");
      if (b.secret.token !== undefined && typeof b.secret.token !== "string")
        fail("Invalid Kross token");
      if (
        Object.keys(b.data).some(
          (key) => !["hotelId", "deviceId"].includes(key),
        )
      )
        fail("Only hotel and device identity can be stored for KrossBooking.");
      b.data = {
        hotelId:
          typeof b.data.hotelId === "string" ? b.data.hotelId.trim() : "",
        deviceId:
          typeof b.data.deviceId === "string" && b.data.deviceId
            ? b.data.deviceId
            : globalThis.crypto.randomUUID(),
      };
    }
    const id = globalThis.crypto.randomUUID();
    db.query("INSERT INTO connections VALUES(?,?,?,?,?,?)").run(
      id,
      b.propertyId,
      b.kind,
      b.name,
      crypto.seal(b.secret),
      JSON.stringify(b.data),
    );
    return c.json({ id, data: b.data }, 201);
  });
  app.delete("/api/v1/connections/:id", (c) => {
    owner(c);
    db.query("DELETE FROM connections WHERE id=?").run(c.req.param("id"));
    return c.json({ ok: true });
  });
  app.post("/api/v1/connections/:id/request", async (c) => {
    const row = get(c.req.param("id"));
    if (!row) fail("Connection missing", 404);
    const secret = crypto.open(row.secret),
      meta = JSON.parse(row.data);
    const input = await c.req.json();
    if (row.kind === "kross") {
      const b = z
        .object({
          path: z.string(),
          body: z.record(z.string(), z.unknown()).default({}),
        })
        .parse(input);
      const path = new URL(b.path, "https://apiapp.krossbooking.com");
      if (
        !krossPaths.has(path.pathname) ||
        path.origin !== "https://apiapp.krossbooking.com" ||
        [...path.searchParams.keys()].some((k) => k !== "page")
      )
        fail("Kross operation not allowed");
      const login = path.pathname === "/auth/get-token";
      if (login) owner(c);
      const operation = login
        ? b.body["2fa_code"]
          ? "otp.verify"
          : b.body["2fa_type"]
            ? "otp.send"
            : "login"
        : path.pathname;
      const started = performance.now();
      log("info", "connector.request.started", {
        provider: "kross",
        operation,
        connectionId: row.id,
      });
      if (!login && !secret.token) fail("Kross login required", 401);
      let r: { status: number; text: string };
      try {
        r = await boundedFetch(
          "https://apiapp.krossbooking.com/v5" + path.pathname + path.search,
          {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              "User-Agent": "okhttp/4.12.0",
              ...(login ? {} : { Authorization: `Bearer ${secret.token}` }),
            },
            body: JSON.stringify(b.body),
          },
        );
      } catch {
        log("warn", "connector.request.failed", {
          provider: "kross",
          operation,
          connectionId: row.id,
          errorCode: "KROSS_NETWORK",
          durationMs: Math.round(performance.now() - started),
        });
        return c.json(
          {
            error:
              "KrossBooking could be reached. Check the connection and retry; your saved login has been kept.",
            code: "KROSS_NETWORK",
          },
          502,
        );
      }
      let providerCode: string | number | undefined;
      try {
        const parsed = JSON.parse(r.text);
        if (typeof parsed.error_code === "number")
          providerCode = parsed.error_code;
      } catch {}
      log(r.status >= 400 ? "warn" : "info", "connector.request.completed", {
        provider: "kross",
        operation,
        connectionId: row.id,
        providerStatus: r.status,
        errorCode: providerCode,
        durationMs: Math.round(performance.now() - started),
      });
      if (r.status === 401) {
        if (operation === "otp.verify")
          return c.json(
            {
              error:
                "KrossBooking rejected the verification attempt. Use the newest code from the selected destination. Check the account credentials if a fresh code is also rejected.",
              code: "KROSS_OTP_REJECTED",
              providerStatus: 401,
              providerCode,
            },
            401,
          );
        secret.token = null;
        // A delayed rejection of an old token must not erase a newer login.
        db.query("UPDATE connections SET secret=? WHERE id=? AND secret=?").run(
          crypto.seal(secret),
          row.id,
          row.secret,
        );
        return c.json(
          {
            error:
              "KrossBooking rejected the credentials or the saved login expired. Sign in again.",
            code: "KROSS_AUTH",
            providerStatus: 401,
          },
          401,
        );
      }
      // The provider can return plain-text 403 ("check your client"). Classify
      // transport failures before parsing JSON, keeping valid shared tokens.
      if (r.status >= 400)
        return c.json(
          {
            error:
              r.status === 403
                ? "KrossBooking refused this request (HTTP 403). This can be a provider or network restriction; your saved login has been kept."
                : `KrossBooking is unavailable (HTTP ${r.status}). Try again; your saved login has been kept.`,
            code: "KROSS_PROVIDER",
            providerStatus: r.status,
          },
          502,
        );
      let data: any;
      try {
        data = JSON.parse(r.text);
      } catch {
        return c.json(
          {
            error:
              "KrossBooking returned an unreadable response. Try again; your saved login has been kept.",
            code: "KROSS_RESPONSE",
          },
          502,
        );
      }
      if (!data || typeof data !== "object" || Array.isArray(data))
        fail("KrossBooking returned an unreadable response", 502);
      if (login) {
        const failed = (v: unknown) =>
          v !== undefined &&
          v !== null &&
          v !== false &&
          v !== 0 &&
          v !== "0" &&
          v !== "";
        if (
          failed(data.error) ||
          failed(data.error_code) ||
          data.success === false
        )
          return c.json(
            {
              error:
                "KrossBooking did not accept the login or verification code. Check your details and try again.",
              code: "KROSS_LOGIN",
            },
            422,
          );
        if (typeof data.auth_token === "string" && data.auth_token) {
          secret.token = data.auth_token;
          if (typeof b.body.hotel_id === "string")
            meta.hotelId = b.body.hotel_id;
          if (typeof b.body.device_id === "string")
            meta.deviceId = b.body.device_id;
          meta.expiry =
            typeof data.auth_token_expire === "string" ||
            typeof data.auth_token_expire === "number"
              ? data.auth_token_expire
              : null;
          db.query("UPDATE connections SET secret=?,data=? WHERE id=?").run(
            crypto.seal(secret),
            JSON.stringify(meta),
            row.id,
          );
          return c.json({
            authenticated: true,
            auth_token_expire: meta.expiry,
          });
        }
        // Only challenge fields leave the relay, never echoed credentials or
        // unrelated token fields present in a provider authentication response.
        const devices = Array.isArray(data.devices)
          ? data.devices
              .filter((d: any) => d && typeof d["2fa_type"] === "string")
              .map((d: any) =>
                Object.fromEntries(
                  ["2fa_type", "2fa_id", "2fa_device"]
                    .filter(
                      (k) =>
                        typeof d[k] === "string" || typeof d[k] === "number",
                    )
                    .map((k) => [k, d[k]]),
                ),
              )
          : [];
        if (!data["2fa"] && !b.body["2fa_type"])
          return c.json(
            {
              error:
                "KrossBooking did not confirm the login. Check the hotel ID and credentials.",
              code: "KROSS_LOGIN",
            },
            422,
          );
        return c.json({ "2fa": !!data["2fa"], devices, authenticated: false });
      }
      return c.json(data);
    }
    if (row.kind === "ical") {
      // Pin DNS resolution for this fetch to the validated public address to prevent rebinding.
      const u = await publicURL(String(secret.url));
      const addresses = await lookup(u.hostname, { all: true }).catch(() => {
        throw new CalendarError(
          "The calendar host could not be reached. Check the URL and DNS, then try again.",
          502,
        );
      });
      if (
        addresses.some((a) => ipaddr.process(a.address).range() !== "unicast")
      )
        fail("Calendar destination rejected");
      const { request } = await import("node:https");
      const text = await new Promise<string>((resolve, reject) => {
        const req = request(
          u,
          {
            method: "GET",
            lookup: ((_hostname: string, options: any, cb: any) =>
              options.all
                ? cb(null, addresses)
                : cb(null, addresses[0].address, addresses[0].family)) as any,
          },
          (res) => {
            if (res.statusCode !== 200) {
              res.resume();
              reject(
                new CalendarError(
                  `Calendar server returned HTTP ${res.statusCode}. Check that the link is publicly accessible.`,
                  502,
                ),
              );
              return;
            }
            const chunks: Buffer[] = [];
            let n = 0;
            res.on("data", (chunk) => {
              n += chunk.length;
              if (n > 4 * 1024 * 1024) {
                req.destroy(
                  new CalendarError(
                    "Calendar exceeds the 4 MiB download limit.",
                    502,
                  ),
                );
                return;
              }
              chunks.push(chunk);
            });
            res.on("end", () => resolve(Buffer.concat(chunks).toString()));
            res.on("error", reject);
          },
        );
        const deadline = setTimeout(
          () =>
            req.destroy(
              new CalendarError(
                "Calendar download timed out. Try again later.",
                502,
              ),
            ),
          20000,
        );
        req.on("close", () => clearTimeout(deadline));
        req.setTimeout(20000, () =>
          req.destroy(
            new CalendarError(
              "Calendar download timed out. Try again later.",
              502,
            ),
          ),
        );
        req.on("error", reject);
        req.end();
      }).catch((error) => {
        if (error instanceof CalendarError) throw error;
        throw new CalendarError(
          "Calendar download failed. Check that the URL is publicly accessible and try again.",
          502,
        );
      });
      return c.json({ text });
    }
    const b = z
      .object({
        image: z.string().max(6 * 1024 * 1024),
        mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
        prompt: z.string().max(12000),
      })
      .parse(input);
    const model = String(meta.model ?? "gemini-2.5-flash");
    if (!/^[a-zA-Z0-9.-]+$/.test(model)) fail("Invalid model");
    const r = await boundedFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": String(secret.key),
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: b.prompt },
                { inlineData: { mimeType: b.mime, data: b.image } },
              ],
            },
          ],
          generationConfig: { responseMimeType: "application/json" },
        }),
      },
    );
    if (r.status !== 200) fail("Image extraction provider failed", 502);
    let data: any;
    try {
      data = JSON.parse(r.text);
    } catch {
      fail("Invalid extraction response", 502);
    }
    return c.json({
      text:
        data.candidates?.[0]?.content?.parts
          ?.map((p: any) => p.text ?? "")
          .join("") ?? "",
    });
  });
}
