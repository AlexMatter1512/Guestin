import type { Hono } from "hono";
import { z } from "zod";
import type { DB } from "./db";
import { digest, token, vault } from "./security";
import { sendMail, type MailSender } from "./mail";
import { smtpSchema } from "../shared/mail";
import { realtime } from "./realtime";

type Options = {
  db: DB;
  key: string;
  origin: string;
  mail?: MailSender;
  fail: (message: string, status?: number) => never | void;
  owner: (c: any) => void;
  passwordWork: <T>(work: () => Promise<T>) => Promise<T>;
  clearAttempts: (identity: string) => void;
  event: (type: string, message: string) => void;
};
export function accountRecovery(o: Options) {
  const { db, fail } = o,
    crypto = vault(o.key);
  const get = (sql: string, ...args: any[]) =>
    db.query(sql).get(...args) as any;
  const run = (sql: string, ...args: any[]) => db.query(sql).run(...args);
  const settings = () => {
    const row = get("SELECT secret FROM smtp_settings WHERE id=1");
    return row ? smtpSchema.parse(crypto.open(row.secret)) : null;
  };
  function issue(user: any, kind: "reset" | "verify") {
    const raw = token(),
      expires = Date.now() + 600000;
    db.transaction(() => {
      run(
        "DELETE FROM account_tokens WHERE expires<=? OR (user_id=? AND kind=?)",
        Date.now(),
        user.id,
        kind,
      );
      run(
        "INSERT INTO account_tokens VALUES(?,?,?,?,?,?)",
        digest(raw),
        user.id,
        kind,
        user.email,
        user.password,
        expires,
      );
    })();
    return {
      url: `${o.origin}/host/#/${kind === "reset" ? "reset-password" : "verify-email"}/${raw}`,
      expires,
    };
  }
  function eligible(raw: string, kind: string) {
    const row = get(
      "SELECT t.*,u.password,u.email current_email FROM account_tokens t JOIN users u ON u.id=t.user_id WHERE t.digest=? AND t.kind=? AND t.expires>?",
      digest(raw),
      kind,
      Date.now(),
    );
    if (
      !row ||
      row.password_hash !== row.password ||
      row.email !== row.current_email
    )
      fail("Link invalid or expired", 400);
    return row;
  }
  function reserveMail(userId: string, kind: string) {
    const now = Date.now();
    const previous = get(
      "SELECT last_sent FROM account_mail_attempts WHERE user_id=? AND kind=?",
      userId,
      kind,
    );
    if (previous && previous.last_sent > now - 60000) return false;
    run(
      "INSERT INTO account_mail_attempts VALUES(?,?,?) ON CONFLICT(user_id,kind) DO UPDATE SET last_sent=excluded.last_sent",
      userId,
      kind,
      now,
    );
    return true;
  }
  const publicReply = {
    ok: true,
    message: "If the account is eligible, your request has been processed.",
  };
  return {
    publicRoutes(app: Hono<any>) {
      app.post("/api/v1/auth/password-reset-request", async (c) => {
        const input = z
          .object({
            email: z.email().transform((v) => v.toLowerCase()),
            method: z.enum(["owner", "email"]),
          })
          .parse(await c.req.json());
        const user = get("SELECT * FROM users WHERE email=?", input.email);
        if (!user) return c.json(publicReply);
        if (input.method === "owner") {
          const exists = get(
            "SELECT 1 FROM password_reset_requests WHERE user_id=?",
            user.id,
          );
          if (!exists) {
            run(
              "INSERT INTO password_reset_requests VALUES(?,?)",
              user.id,
              Date.now(),
            );
            o.event(
              "account.reset_requested",
              `Password reset requested for ${user.name} (${user.email})`,
            );
            realtime(db).workspaceChanged();
          }
        } else {
          const smtp = settings();
          if (
            smtp &&
            get(
              "SELECT 1 FROM email_verifications WHERE user_id=? AND email=?",
              user.id,
              user.email,
            ) &&
            reserveMail(user.id, "reset")
          ) {
            const link = issue(user, "reset");
            try {
              await (o.mail ?? sendMail)(smtp, {
                to: user.email,
                subject: "Reset your guestin password",
                text: `Reset your password using this link (valid for 10 minutes, once only):\n\n${link.url}\n\nIf you did not request this, ignore this email.`,
              });
            } catch {
              /* Keep public responses independent of account eligibility and delivery. */
            }
          }
        }
        return c.json(publicReply);
      });
      app.post("/api/v1/auth/reset-password", async (c) => {
        const input = z
          .object({
            token: z.string().min(1).max(200),
            password: z.string().min(12).max(200),
          })
          .parse(await c.req.json());
        eligible(input.token, "reset");
        const password = await o.passwordWork(async () => {
          eligible(input.token, "reset");
          return Bun.password.hash(input.password, { algorithm: "argon2id" });
        });
        db.transaction(() => {
          const row = eligible(input.token, "reset");
          run("UPDATE users SET password=? WHERE id=?", password, row.user_id);
          run("DELETE FROM sessions WHERE user_id=?", row.user_id);
          run("DELETE FROM account_tokens WHERE user_id=?", row.user_id);
          run(
            "DELETE FROM password_reset_requests WHERE user_id=?",
            row.user_id,
          );
          o.clearAttempts(row.email);
        })();
        realtime(db).heartbeat();
        realtime(db).workspaceChanged();
        return c.json({ ok: true });
      });
      app.post("/api/v1/auth/verify-email", async (c) => {
        const input = z
          .object({ token: z.string().min(1).max(200) })
          .parse(await c.req.json());
        db.transaction(() => {
          const row = eligible(input.token, "verify");
          run(
            "INSERT INTO email_verifications VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,verified_at=excluded.verified_at",
            row.user_id,
            row.email,
            Date.now(),
          );
          run("DELETE FROM account_tokens WHERE digest=?", row.digest);
          realtime(db).accountChanged(row.user_id);
        })();
        return c.json({ ok: true });
      });
    },
    privateRoutes(app: Hono<any>) {
      app.get("/api/v1/mail/status", (c) =>
        c.json({ configured: !!settings() }),
      );
      app.get("/api/v1/admin/smtp", (c) => {
        o.owner(c);
        const smtp = settings();
        return c.json(
          smtp ? { ...smtp, password: "", hasPassword: !!smtp.password } : null,
        );
      });
      app.put("/api/v1/admin/smtp", async (c) => {
        o.owner(c);
        const input = smtpSchema.parse(await c.req.json());
        const previous = settings();
        if (
          !input.password &&
          input.username &&
          previous?.username === input.username &&
          previous.host === input.host
        )
          input.password = previous.password;
        run(
          "INSERT INTO smtp_settings VALUES(1,?) ON CONFLICT(id) DO UPDATE SET secret=excluded.secret",
          crypto.seal(input),
        );
        realtime(db).workspaceChanged();
        return c.json({ ok: true });
      });
      app.delete("/api/v1/admin/smtp", (c) => {
        o.owner(c);
        run("DELETE FROM smtp_settings");
        run("DELETE FROM account_tokens WHERE kind='verify'");
        realtime(db).workspaceChanged();
        return c.json({ ok: true });
      });
      app.post("/api/v1/admin/smtp/test", async (c) => {
        o.owner(c);
        const smtp = settings();
        if (!smtp) {
          fail("Configure SMTP first");
          return c.json({});
        }
        try {
          await (o.mail ?? sendMail)(smtp, {
            to: c.get("user").email,
            subject: "guestin SMTP test",
            text: "Your SMTP configuration can send emails.",
          });
        } catch {
          fail("Test email failed. Check SMTP settings and try again.", 502);
        }
        return c.json({ ok: true });
      });
      app.post("/api/v1/me/verify-email", async (c) => {
        const user = get("SELECT * FROM users WHERE id=?", c.get("user").id);
        const smtp = settings();
        if (!smtp) {
          fail("Email delivery is not configured");
          return c.json({});
        }
        if (!reserveMail(user.id, "verify")) {
          fail("Wait a minute before requesting another email", 429);
          return c.json({});
        }
        const link = issue(user, "verify");
        try {
          await (o.mail ?? sendMail)(smtp, {
            to: user.email,
            subject: "Verify your guestin email",
            text: `Verify your email using this link (valid for 10 minutes, once only):\n\n${link.url}\n\nIf you did not request this, ignore this email.`,
          });
        } catch {
          fail("Verification email failed. Try again later.", 502);
        }
        return c.json({ ok: true });
      });
      app.post("/api/v1/users/:id/password-reset-link", (c) => {
        o.owner(c);
        const user = get("SELECT * FROM users WHERE id=?", c.req.param("id"));
        if (!user) {
          fail("Account missing", 404);
          return c.json({});
        }
        const link = issue(user, "reset");
        run("DELETE FROM password_reset_requests WHERE user_id=?", user.id);
        realtime(db).workspaceChanged();
        return c.json(link);
      });
    },
  };
}
