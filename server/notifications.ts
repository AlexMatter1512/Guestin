import type { DB } from "./db";

export function retentionCutoff(months: number, now = new Date()) {
  const cutoff = new Date(now);
  const day = cutoff.getUTCDate();
  cutoff.setUTCDate(1);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  const lastDay = new Date(
    Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0),
  ).getUTCDate();
  cutoff.setUTCDate(Math.min(day, lastDay));
  return cutoff.toISOString();
}

export function pruneNotifications(db: DB, now = new Date()) {
  db.transaction(() => {
    const scopes = db
      .query(
        "SELECT p.id,COALESCE(s.notification_months,3) months FROM properties p LEFT JOIN property_settings s ON s.property_id=p.id",
      )
      .all() as { id: string | null; months: number }[];
    scopes.push({ id: null, months: 3 });
    for (const scope of scopes) {
      const cutoff = retentionCutoff(scope.months, now);
      db.query(
        "DELETE FROM jobs WHERE event_id IN (SELECT id FROM events WHERE property_id IS ? AND created<?)",
      ).run(scope.id, cutoff);
      db.query("DELETE FROM events WHERE property_id IS ? AND created<?").run(
        scope.id,
        cutoff,
      );
    }
    db.query("DELETE FROM breakfast_sessions WHERE expires<=?").run(
      now.getTime(),
    );
  })();
}
