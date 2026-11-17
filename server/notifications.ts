import type { DB } from "./db";

// Preserve historical classification when an event predates explicit categories.
// Filter in SQL so pagination and bulk read receipts use the same event set.
export function notificationCategorySQL(table = "events") {
  return `COALESCE(
    (SELECT json_extract(data,'$.category') FROM event_context WHERE event_id=${table}.id),
    CASE WHEN (${table}.type LIKE 'access.%' OR ${table}.type LIKE 'breakfast.%')
      AND COALESCE((SELECT json_extract(data,'$.actor') FROM event_context WHERE event_id=${table}.id),'')=''
      AND NOT EXISTS (SELECT 1 FROM codes WHERE id=${table}.code_id AND json_extract(data,'$.staff')=1)
      THEN 'guest' ELSE 'staff' END)`;
}

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
    db.query("DELETE FROM account_tokens WHERE expires<=?").run(now.getTime());
    db.query("DELETE FROM breakfast_sessions WHERE expires<=?").run(
      now.getTime(),
    );
  })();
}
