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
        "SELECT p.id,COALESCE(s.notification_months,3) months,COALESCE(s.notification_limit,1000) max_count FROM properties p LEFT JOIN property_settings s ON s.property_id=p.id WHERE json_extract(p.data,'$.active') IS NOT 0",
      )
      .all() as { id: string | null; months: number; max_count: number }[];
    scopes.push({ id: null, months: 3, max_count: 1000 });
    for (const scope of scopes) {
      const cutoff = retentionCutoff(scope.months, now);
      const expired = `SELECT id FROM events WHERE property_id IS ? AND created<?
        UNION SELECT id FROM (SELECT id FROM events WHERE property_id IS ? ORDER BY created DESC,id DESC LIMIT -1 OFFSET ?)`;
      const args = [scope.id, cutoff, scope.id, scope.max_count] as const;
      db.query(`DELETE FROM jobs WHERE event_id IN (${expired})`).run(...args);
      db.query(`DELETE FROM events WHERE id IN (${expired})`).run(...args);
    }
    db.query("DELETE FROM breakfast_sessions WHERE expires<=?").run(
      now.getTime(),
    );
  })();
}
