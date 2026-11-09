import { log } from "./log";
import webpush from "web-push";
import type { DB } from "./db";
import { databaseLifecycle } from "./lifecycle";
export async function deliverPush(db: DB, send = webpush.sendNotification) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  const lifecycle = databaseLifecycle(db);
  if (lifecycle.resetting) return;
  lifecycle.active++;
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? "mailto:admin@example.com",
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
    const jobs = db
      .query(
        "SELECT j.*,s.data,e.type,e.message FROM jobs j JOIN subscriptions s ON s.id=j.subscription_id JOIN events e ON e.id=j.event_id WHERE next<=? LIMIT 20",
      )
      .all(Date.now()) as any[];
    for (const j of jobs) {
      try {
        await send(
          JSON.parse(j.data),
          JSON.stringify({
            id: j.event_id,
            title: "oshost · " + j.type,
            body: j.message,
            url: "/host/",
          }),
          { TTL: 3600, timeout: 10000 },
        );
        log("info", "push.delivered", {
          eventId: j.event_id,
          subscriptionId: j.subscription_id,
          attempt: j.attempts + 1,
        });
        db.query("DELETE FROM jobs WHERE event_id=? AND subscription_id=?").run(
          j.event_id,
          j.subscription_id,
        );
      } catch (e: any) {
        log("warn", "push.delivery_failed", {
          eventId: j.event_id,
          subscriptionId: j.subscription_id,
          attempt: j.attempts + 1,
          providerStatus:
            typeof e.statusCode === "number" ? e.statusCode : undefined,
          outcome:
            e.statusCode === 404 || e.statusCode === 410
              ? "subscription_removed"
              : j.attempts >= 4
                ? "exhausted"
                : "retry_scheduled",
        });
        if (e.statusCode === 404 || e.statusCode === 410)
          db.query("DELETE FROM subscriptions WHERE id=?").run(
            j.subscription_id,
          );
        else if (j.attempts >= 4)
          db.query(
            "DELETE FROM jobs WHERE event_id=? AND subscription_id=?",
          ).run(j.event_id, j.subscription_id);
        else
          db.query(
            "UPDATE jobs SET attempts=attempts+1,next=? WHERE event_id=? AND subscription_id=?",
          ).run(
            Date.now() + 60000 * 2 ** j.attempts,
            j.event_id,
            j.subscription_id,
          );
      }
    }
  } finally {
    lifecycle.active--;
  }
}
