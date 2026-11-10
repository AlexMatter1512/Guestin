import type { DB } from "./db";
import { vault } from "./security";
import { normalizeDoorInput, webhookRequest } from "../shared/webhook";

// Secrets need APP_KEY, so this data migration runs during app initialization.
// One transaction prevents partially migrated doors; subsequent starts are no-ops.
export function migrateWebhookDoors(db: DB, key: string) {
  const crypto = vault(key);
  db.transaction(() => {
    const rows = db
      .query(
        "SELECT id,data,secret FROM doors WHERE json_extract(data,'$.integration') IN ('ewelink','shelly')",
      )
      .all() as { id: string; data: string; secret: string }[];
    for (const row of rows) {
      const { config, ...data } = normalizeDoorInput({
        ...JSON.parse(row.data),
        config: crypto.open(row.secret),
      });
      webhookRequest(config);
      db.query("UPDATE doors SET data=?,secret=? WHERE id=?").run(
        JSON.stringify(data),
        crypto.seal(config),
        row.id,
      );
    }
  })();
}
