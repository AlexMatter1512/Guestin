import type { Hono } from "hono";
import type { DB } from "./db";
import { z } from "zod";
import { digest, token } from "./security";
import { setLogActor } from "./log";

export function mayReadBreakfast(db: DB, propertyId: string, cookie = "") {
  const settings = db
    .query(
      "SELECT breakfast_password FROM property_settings WHERE property_id=?",
    )
    .get(propertyId) as any;
  if (!settings?.breakfast_password) return true;
  const cookies = Object.fromEntries(
    cookie.split(/;\s*/).map((part) => {
      const index = part.indexOf("=");
      return [part.slice(0, index), part.slice(index + 1)];
    }),
  );
  const host = cookies.oshost_session;
  const hostUser =
    host &&
    (db
      .query(
        "SELECT u.id,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.digest=? AND s.expires>?",
      )
      .get(digest(host), Date.now()) as {
      id: string;
      name: string;
      role: string;
    } | null);
  if (hostUser) {
    setLogActor(hostUser);
    return true;
  }
  const breakfast = cookies["oshost_breakfast_" + propertyId];
  return (
    !!breakfast &&
    !!db
      .query(
        "SELECT 1 FROM breakfast_sessions WHERE digest=? AND property_id=? AND expires>?",
      )
      .get(digest(breakfast), propertyId, Date.now())
  );
}

export function breakfastAccessRoutes(
  app: Hono<any>,
  db: DB,
  origin: string,
  owner: (c: any) => void,
  fail: (message: string, status?: number) => never,
) {
  app.put("/api/v1/properties/:id/breakfast-settings", async (c) => {
    owner(c);
    const id = c.req.param("id");
    if (!db.query("SELECT 1 FROM properties WHERE id=?").get(id))
      fail("Property missing", 404);
    const input = z
      .object({
        enabled: z.boolean(),
        password: z.string().min(8).max(128).optional(),
      })
      .parse(await c.req.json());
    const saved = db
      .query(
        "SELECT breakfast_password FROM property_settings WHERE property_id=?",
      )
      .get(id) as any;
    let hash = saved?.breakfast_password ?? null;
    if (!input.enabled) hash = null;
    else if (input.password)
      hash = await Bun.password.hash(input.password, { algorithm: "argon2id" });
    else if (!hash) fail("Choose a password of at least 8 characters");
    db.transaction(() => {
      db.query(
        "INSERT INTO property_settings(property_id,breakfast_password) VALUES(?,?) ON CONFLICT(property_id) DO UPDATE SET breakfast_password=excluded.breakfast_password",
      ).run(id, hash);
      if (hash !== saved?.breakfast_password)
        db.query("DELETE FROM breakfast_sessions WHERE property_id=?").run(id);
    })();
    return c.json({ protected: !!hash });
  });
  const attempts = new Map<string, { count: number; until: number }>();
  app.post("/api/v1/public/breakfast/:property/auth", async (c) => {
    const id = c.req.param("property");
    const key = c.env?.clientIP ?? "direct";
    const now = Date.now();
    if (attempts.size > 10000)
      for (const [key, bucket] of attempts)
        if (bucket.until <= now) attempts.delete(key);
    let bucket = attempts.get(key);
    if (!bucket || bucket.until <= now) {
      if (!bucket && attempts.size >= 10000)
        return c.json({ error: "Too many attempts; try again shortly" }, 429);
      bucket = { count: 0, until: now + 60000 };
      attempts.set(key, bucket);
    }
    if (++bucket.count > 10)
      return c.json({ error: "Too many attempts; try again shortly" }, 429);
    if (!db.query("SELECT 1 FROM properties WHERE id=?").get(id))
      fail("Property missing", 404);
    const { password } = z
      .object({ password: z.string().max(128) })
      .parse(await c.req.json());
    const saved = db
      .query(
        "SELECT breakfast_password FROM property_settings WHERE property_id=?",
      )
      .get(id) as any;
    if (
      saved?.breakfast_password &&
      !(await Bun.password.verify(password, saved.breakfast_password))
    )
      return c.json(
        { error: "Incorrect password", requiresPassword: true },
        401,
      );
    if (saved?.breakfast_password) {
      const current = db
        .query(
          "SELECT breakfast_password FROM property_settings WHERE property_id=?",
        )
        .get(id) as any;
      if (current?.breakfast_password !== saved.breakfast_password)
        return c.json(
          { error: "Password changed; try again", requiresPassword: true },
          401,
        );
      const raw = token();
      db.query("INSERT INTO breakfast_sessions VALUES(?,?,?)").run(
        digest(raw),
        id,
        now + 12 * 3600000,
      );
      c.header(
        "Set-Cookie",
        `oshost_breakfast_${id}=${raw}; Path=/api/v1/public/breakfast/; HttpOnly; SameSite=Strict; Max-Age=43200${origin.startsWith("https:") ? "; Secure" : ""}`,
      );
    }
    return c.json({ ok: true });
  });
}
