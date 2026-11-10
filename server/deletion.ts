import type { DB } from "./db";

// Call inside the caller's transaction, after checking in-flight operations.
export function deleteCode(db: DB, id: string) {
  db.query(
    "DELETE FROM jobs WHERE event_id IN (SELECT id FROM events WHERE code_id=?)",
  ).run(id);
  db.query("DELETE FROM events WHERE code_id=?").run(id);
  for (const table of ["actions", "redemptions", "grants", "code_metrics"])
    db.query(`DELETE FROM ${table} WHERE code_id=?`).run(id);
  db.query("DELETE FROM codes WHERE id=?").run(id);
}

export function deleteProperty(db: DB, id: string) {
  for (const code of db
    .query("SELECT id FROM codes WHERE property_id=?")
    .all(id) as { id: string }[])
    deleteCode(db, code.id);
  db.query(
    "DELETE FROM jobs WHERE event_id IN (SELECT id FROM events WHERE property_id=?)",
  ).run(id);
  db.query("DELETE FROM events WHERE property_id=?").run(id);
  db.query(
    "DELETE FROM door_tests WHERE door_id IN (SELECT id FROM doors WHERE property_id=?)",
  ).run(id);
  db.query(
    "DELETE FROM grants WHERE door_id IN (SELECT id FROM doors WHERE property_id=?)",
  ).run(id);
  for (const table of [
    "doors",
    "connections",
    "templates",
    "breakfast_sessions",
    "property_settings",
  ])
    db.query(`DELETE FROM ${table} WHERE property_id=?`).run(id);
  for (const row of db
    .query("SELECT id,preferences FROM subscriptions")
    .all() as { id: string; preferences: string }[]) {
    const preferences = JSON.parse(row.preferences);
    if (!preferences.properties?.includes(id)) continue;
    const selected = preferences.properties;
    preferences.properties = selected.filter((p: string) => p !== id);
    // Empty legacy selections mean all: preserve the explicit subset instead.
    preferences.allProperties ??= selected.length === 0;
    db.query("UPDATE subscriptions SET preferences=? WHERE id=?").run(
      JSON.stringify(preferences),
      row.id,
    );
  }
  db.query("DELETE FROM properties WHERE id=?").run(id);
}
