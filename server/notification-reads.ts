import type { DB } from "./db";

export function notificationReads(db: DB) {
  function unread(userId: string) {
    const rows = db
      .query(
        `SELECT e.property_id,COUNT(*) count FROM events e
      WHERE (e.property_id IS NULL OR e.property_id IN (SELECT id FROM properties WHERE json_extract(data,'$.active') IS NOT 0))
      AND NOT EXISTS (SELECT 1 FROM event_reads r WHERE r.event_id=e.id AND r.user_id=?)
      GROUP BY e.property_id`,
      )
      .all(userId) as { property_id: string | null; count: number }[];
    let total = 0,
      global = 0;
    const properties: Record<string, number> = {};
    for (const row of rows) {
      total += row.count;
      if (row.property_id === null) global = row.count;
      else properties[row.property_id] = row.count;
    }
    return { total, global, properties };
  }
  function mark(userId: string, eventIds: string[]) {
    return db.transaction(() => {
      let changed = 0;
      const insert =
        db.query(`INSERT OR IGNORE INTO event_reads(event_id,user_id,read_at)
        SELECT id,?,? FROM events WHERE id=?`);
      const at = new Date().toISOString();
      for (const id of new Set(eventIds))
        changed += insert.run(userId, at, id).changes;
      return changed;
    })();
  }
  function markAll(userId: string, propertyId?: string) {
    return db
      .query(
        `INSERT OR IGNORE INTO event_reads(event_id,user_id,read_at)
      SELECT id,?,? FROM events${propertyId ? " WHERE property_id=? OR property_id IS NULL" : ""}`,
      )
      .run(
        userId,
        new Date().toISOString(),
        ...(propertyId ? [propertyId] : []),
      ).changes;
  }
  return { unread, mark, markAll };
}
