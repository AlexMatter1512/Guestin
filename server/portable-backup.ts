import type { DB } from "./db";
import {
  backupSchema,
  MAX_BACKUP_BYTES,
  type PortableBackup,
} from "../shared/backup";
import { digest, vault } from "./security";
import { log } from "./log";

export function exportRecords(
  db: DB,
  key: string,
  propertyId?: string,
): PortableBackup {
  const scope = propertyId ? [propertyId] : [];
  const crypto = vault(key);
  const all = (sql: string, ...args: any[]) =>
    db.query(sql).all(...args) as any[];
  const get = (sql: string, ...args: any[]) =>
    db.query(sql).get(...args) as any;
  return db.transaction(() =>
    backupSchema.parse({
      format: "oshost-json",
      version: 1,
      exportedAt: new Date().toISOString(),
      properties: all(
        "SELECT p.*,s.notification_months,s.notification_limit,s.breakfast_password,t.data templates FROM properties p LEFT JOIN property_settings s ON s.property_id=p.id LEFT JOIN templates t ON t.property_id=p.id" +
          (propertyId ? " WHERE p.id=?" : ""),
        ...scope,
      ).map((p) => ({
        id: p.id,
        data: JSON.parse(p.data),
        retentionMonths: p.notification_months ?? 3,
        maxNotifications: p.notification_limit ?? 1000,
        breakfastPassword: p.breakfast_password,
        ...(p.templates ? { templates: JSON.parse(p.templates) } : {}),
      })),
      doors: all(
        "SELECT * FROM doors" + (propertyId ? " WHERE property_id=?" : ""),
        ...scope,
      ).map((d) => {
        const { photos, primaryPhotoId, ...data } = JSON.parse(d.data);
        return { id: d.id, data, config: crypto.open(d.secret) };
      }),
      codes: all(
        "SELECT c.*,u.name creator_name FROM codes c LEFT JOIN users u ON u.id=c.creator" +
          (propertyId ? " WHERE c.property_id=?" : ""),
        ...scope,
      ).map((c) => ({
        id: c.id,
        data: JSON.parse(c.data),
        token: crypto.open(c.secret),
        revoked: !!c.revoked,
        created: c.created,
        creatorId: c.creator ?? JSON.parse(c.data).importedCreatorId ?? null,
        creatorName:
          c.creator_name ?? JSON.parse(c.data).importedCreatorName ?? null,
        grants: all("SELECT * FROM grants WHERE code_id=?", c.id).map((g) => ({
          doorId: g.door_id,
          start: g.start,
          end: g.end,
          singleUse: !!g.single_use,
          used: g.used,
          active: !!g.active,
          claim: g.claim,
        })),
        redemptions: all(
          "SELECT id,quantity,date,created FROM redemptions WHERE code_id=?",
          c.id,
        ),
        actions: all("SELECT * FROM actions WHERE code_id=?", c.id).map((a) => {
          const result = JSON.parse(a.result);
          return {
            id: a.id,
            kind: a.kind,
            target: a.target,
            result:
              result.status === "pending"
                ? {
                    ...result,
                    detail: result.detail ?? "Device request in progress",
                  }
                : result,
          };
        }),
        metrics: get(
          "SELECT attempts,accepted FROM code_metrics WHERE code_id=?",
          c.id,
        ) ?? { attempts: 0, accepted: 0 },
      })),
      doorTests: all(
        "SELECT * FROM door_tests" +
          (propertyId
            ? " WHERE door_id IN (SELECT id FROM doors WHERE property_id=?)"
            : ""),
        ...scope,
      )
        .filter((t) => !!get("SELECT 1 FROM doors WHERE id=?", t.door_id))
        .map((t) => ({
          id: t.id,
          doorId: t.door_id,
          userId: t.user_id,
          result: JSON.parse(t.result),
          resolved: !!t.resolved,
          created: t.created,
        })),
      events: all(
        "SELECT e.*,ec.data context FROM events e LEFT JOIN event_context ec ON ec.event_id=e.id" +
          (propertyId ? " WHERE e.property_id=?" : ""),
        ...scope,
      ).map((e) => ({
        id: e.id,
        propertyId: e.property_id,
        codeId: e.code_id,
        type: e.type,
        message: e.message,
        created: e.created,
        context: JSON.parse(e.context ?? "{}"),
      })),
    }),
  )();
}
export function restoreRecords(
  db: DB,
  key: string,
  input: unknown,
  validateDevice: (kind: string, config: Record<string, string>) => void,
) {
  const backup = backupSchema.parse(input),
    crypto = vault(key);
  const get = (sql: string, ...args: any[]) =>
    db.query(sql).get(...args) as any;
  const run = (sql: string, ...args: any[]) => db.query(sql).run(...args);
  const fail = (message: string) => {
    throw Object.assign(Error(message), { status: 409 });
  };
  for (const d of backup.doors) validateDevice(d.data.integration, d.config);
  return db.transaction(() => {
    const result = {
      properties: 0,
      doors: 0,
      codes: 0,
      skippedProperties: 0,
      skippedDoors: 0,
      skippedCodes: 0,
    };
    // Add only: never roll back usage, secrets or revocation on existing records.
    for (const p of backup.properties) {
      if (get("SELECT 1 FROM properties WHERE id=?", p.id)) {
        result.skippedProperties++;
        continue;
      }
      run("INSERT INTO properties VALUES(?,?)", p.id, JSON.stringify(p.data));
      run(
        "INSERT INTO property_settings(property_id,notification_months,breakfast_password,notification_limit) VALUES(?,?,?,?)",
        p.id,
        p.retentionMonths,
        p.breakfastPassword,
        p.maxNotifications,
      );
      if (p.templates)
        run(
          "INSERT INTO templates VALUES(?,?)",
          p.id,
          JSON.stringify(p.templates),
        );
      result.properties++;
    }
    const addedDoors = new Set<string>();
    for (const d of backup.doors) {
      const prior = get("SELECT property_id FROM doors WHERE id=?", d.id);
      if (prior) {
        if (prior.property_id !== d.data.propertyId)
          fail("A door ID belongs to another structure");
        result.skippedDoors++;
        continue;
      }
      run(
        "INSERT INTO doors VALUES(?,?,?,?)",
        d.id,
        d.data.propertyId,
        JSON.stringify({ ...d.data, photos: [], primaryPhotoId: null }),
        crypto.seal(d.config),
      );
      addedDoors.add(d.id);
      result.doors++;
    }
    for (const c of backup.codes) {
      const prior = get("SELECT property_id FROM codes WHERE id=?", c.id);
      if (prior) {
        if (prior.property_id !== c.data.propertyId)
          fail("A code ID belongs to another structure");
        result.skippedCodes++;
        continue;
      }
      if (get("SELECT 1 FROM codes WHERE digest=?", digest(c.token)))
        fail("A guest token already belongs to another code");
      const creator =
        c.creatorId && get("SELECT 1 FROM users WHERE id=?", c.creatorId)
          ? c.creatorId
          : null;
      run(
        "INSERT INTO codes VALUES(?,?,?,?,?,?,?,?)",
        c.id,
        c.data.propertyId,
        creator,
        digest(c.token),
        crypto.seal(c.token),
        JSON.stringify({
          ...c.data,
          ...(!creator
            ? {
                importedCreatorId: c.creatorId,
                ...(c.creatorName
                  ? { importedCreatorName: c.creatorName }
                  : {}),
              }
            : {}),
        }),
        Number(c.revoked),
        c.created,
      );
      for (const g of c.grants)
        run(
          "INSERT INTO grants(code_id,door_id,start,end,single_use,used,claim,active) VALUES(?,?,?,?,?,?,?,?)",
          c.id,
          g.doorId,
          g.start,
          g.end,
          Number(g.singleUse),
          g.used,
          g.claim,
          Number(g.active),
        );
      for (const a of c.actions) {
        if (get("SELECT 1 FROM actions WHERE id=?", a.id))
          fail("An action ID is already in use");
        const outcome =
          "status" in a.result && a.result.status === "pending"
            ? {
                status: "uncertain",
                detail:
                  "Restored unresolved request; check the door before retrying",
              }
            : a.result;
        run(
          "INSERT INTO actions VALUES(?,?,?,?,?)",
          a.id,
          c.id,
          a.kind,
          a.target,
          JSON.stringify(outcome),
        );
      }
      for (const r of c.redemptions) {
        if (get("SELECT 1 FROM redemptions WHERE id=?", r.id))
          fail("A redemption ID is already in use");
        run(
          "INSERT INTO redemptions VALUES(?,?,?,?,?)",
          r.id,
          c.id,
          r.quantity,
          r.date,
          r.created,
        );
      }
      run(
        "INSERT INTO code_metrics VALUES(?,?,?)",
        c.id,
        c.metrics.attempts,
        c.metrics.accepted,
      );
      result.codes++;
    }
    for (const test of backup.doorTests) {
      if (!addedDoors.has(test.doorId)) continue;
      if (get("SELECT 1 FROM door_tests WHERE id=?", test.id))
        fail("A door test ID is already in use");
      const outcome =
        test.result.status === "pending"
          ? {
              status: "uncertain",
              detail:
                "Restored unresolved test; check the door before retrying",
            }
          : test.result;
      const user =
        test.userId && get("SELECT 1 FROM users WHERE id=?", test.userId)
          ? test.userId
          : null;
      run(
        "INSERT INTO door_tests VALUES(?,?,?,?,?,?)",
        test.id,
        test.doorId,
        user,
        JSON.stringify(outcome),
        Number(test.resolved),
        test.created,
      );
    }
    for (const e of backup.events) {
      if (get("SELECT 1 FROM events WHERE id=?", e.id)) continue;
      run(
        "INSERT INTO events VALUES(?,?,?,?,?,?)",
        e.id,
        e.propertyId,
        e.codeId,
        e.type,
        e.message,
        e.created,
      );
      run(
        "INSERT INTO event_context VALUES(?,?)",
        e.id,
        JSON.stringify(e.context),
      );
    }
    return result;
  })();
}
export function portableBackupRoutes(
  app: any,
  db: DB,
  key: string,
  owner: (c: any) => void,
  validateDevice: (kind: string, config: Record<string, string>) => void,
) {
  app.get("/api/v1/admin/export", (c: any) => {
    owner(c);
    const backup = exportRecords(db, key);
    log("info", "records.exported", {
      count:
        backup.properties.length + backup.doors.length + backup.codes.length,
    });
    c.header(
      "Content-Disposition",
      `attachment; filename="oshost-${backup.exportedAt.slice(0, 10)}.json"`,
    );
    return c.json(backup);
  });
  app.post("/api/v1/admin/import", async (c: any) => {
    owner(c);
    const text = await c.req.text();
    if (Buffer.byteLength(text) > MAX_BACKUP_BYTES)
      return c.json({ error: "Choose a JSON backup smaller than 32 MB" }, 413);
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      return c.json({ error: "Invalid JSON backup" }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      return c.json({ error: "Invalid JSON backup" }, 400);
    if (body.confirmation !== "RESTORE")
      return c.json({ error: "Type RESTORE to confirm" }, 400);
    const result = restoreRecords(db, key, body.backup, validateDevice);
    log("info", "records.restored", {
      count: result.properties + result.doors + result.codes,
    });
    return c.json(result);
  });
}
