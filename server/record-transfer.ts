import type { DB } from "./db";
import { z } from "zod";
import { MAX_BACKUP_BYTES, backupSchema } from "../shared/backup";
import {
  recordTransferSchema,
  doorTransferSchema,
  codeTransferSchema,
  replacementConfirmation,
  type RecordKind,
} from "../shared/record-transfer";
import { exportRecords, restoreRecords } from "./portable-backup";
import { vault } from "./security";
import { deleteCode } from "./deletion";
import { databaseLifecycle } from "./lifecycle";
import { pruneNotifications } from "./notifications";
import { realtime } from "./realtime";
import { log } from "./log";

function fail(message: string, status = 409): never {
  throw Object.assign(Error(message), { status });
}
function property(db: DB, id: string) {
  const row = db.query("SELECT data FROM properties WHERE id=?").get(id) as {
    data: string;
  } | null;
  if (!row) fail("Structure missing", 404);
  if (JSON.parse(row.data).active === false)
    fail("Structure is deactivated", 403);
  return row;
}
export function exportRecordList(
  db: DB,
  key: string,
  kind: RecordKind,
  propertyId: string,
) {
  property(db, propertyId);
  const header = {
    version: 1 as const,
    exportedAt: new Date().toISOString(),
    propertyId,
  };
  if (kind === "doors") {
    const crypto = vault(key);
    return doorTransferSchema.parse({
      ...header,
      format: "oshost-doors",
      doors: (
        db
          .query("SELECT * FROM doors WHERE property_id=? ORDER BY id")
          .all(propertyId) as any[]
      ).map((d) => ({
        id: d.id,
        data: JSON.parse(d.data),
        config: crypto.open(d.secret),
      })),
      doorTests: (
        db
          .query(
            "SELECT t.* FROM door_tests t JOIN doors d ON d.id=t.door_id WHERE d.property_id=?",
          )
          .all(propertyId) as any[]
      ).map((t) => ({
        id: t.id,
        doorId: t.door_id,
        userId: t.user_id,
        result: JSON.parse(t.result),
        resolved: !!t.resolved,
        created: t.created,
      })),
    });
  }
  const all = exportRecords(db, key, propertyId),
    codes = all.codes.filter((c) => c.data.propertyId === propertyId),
    ids = new Set(codes.map((c) => c.id));
  return codeTransferSchema.parse({
    ...header,
    format: "oshost-codes",
    codes,
    events: all.events.filter((e) => e.codeId && ids.has(e.codeId)),
  });
}
export function importRecordList(
  db: DB,
  key: string,
  kind: RecordKind,
  propertyId: string,
  input: unknown,
  mode: "append" | "replace",
  validateDevice: (kind: string, config: Record<string, string>) => void,
  validatePhotos: (data: any) => void,
) {
  property(db, propertyId);
  const doc = recordTransferSchema.parse(input),
    crypto = vault(key);
  if (doc.format !== (kind === "doors" ? "oshost-doors" : "oshost-codes"))
    fail("Choose a JSON file for this list", 400);
  return db.transaction(() => {
    const result = { added: 0, skipped: 0, replaced: 0, removed: 0 };
    if (mode === "replace") {
      if (
        db
          .query(
            "SELECT 1 FROM grants g JOIN codes c ON c.id=g.code_id WHERE c.property_id=? AND g.claim IS NOT NULL LIMIT 1",
          )
          .get(propertyId)
      )
        fail("Resolve uncertain device requests before replacing this list");
      if (
        kind === "doors" &&
        db
          .query(
            "SELECT 1 FROM door_tests t JOIN doors d ON d.id=t.door_id WHERE d.property_id=? AND t.resolved=0 LIMIT 1",
          )
          .get(propertyId)
      )
        fail("Resolve uncertain door tests before replacing this list");
    }
    if (doc.format === "oshost-doors") {
      for (const d of doc.doors) {
        validateDevice(d.data.integration, d.config);
        validatePhotos(d.data);
        const prior = db
          .query("SELECT property_id FROM doors WHERE id=?")
          .get(d.id) as any;
        if (prior && prior.property_id !== propertyId)
          fail("A door ID belongs to another structure");
      }
      const prior = db
          .query("SELECT id FROM doors WHERE property_id=?")
          .all(propertyId) as { id: string }[],
        incoming = new Set(doc.doors.map((d) => d.id)),
        added = new Set<string>();
      if (mode === "replace") {
        db.query(
          "DELETE FROM door_tests WHERE door_id IN (SELECT id FROM doors WHERE property_id=?)",
        ).run(propertyId);
        for (const old of prior)
          if (!incoming.has(old.id)) {
            db.query("DELETE FROM grants WHERE door_id=?").run(old.id);
            db.query("DELETE FROM doors WHERE id=?").run(old.id);
            result.removed++;
          }
      }
      for (const d of doc.doors) {
        const exists = prior.some((p) => p.id === d.id);
        if (exists && mode === "append") {
          result.skipped++;
          continue;
        }
        const data = JSON.stringify({ ...d.data, propertyId }),
          secret = crypto.seal(d.config);
        if (exists) {
          db.query("UPDATE doors SET data=?,secret=? WHERE id=?").run(
            data,
            secret,
            d.id,
          );
          result.replaced++;
        } else {
          db.query("INSERT INTO doors VALUES(?,?,?,?)").run(
            d.id,
            propertyId,
            data,
            secret,
          );
          result.added++;
          added.add(d.id);
        }
      }
      for (const test of doc.doorTests) {
        if (mode === "append" && !added.has(test.doorId)) continue;
        if (db.query("SELECT 1 FROM door_tests WHERE id=?").get(test.id))
          fail("A door test ID is already in use");
        const outcome =
          test.result.status === "pending"
            ? {
                status: "uncertain",
                detail:
                  "Imported unresolved test; check the door before retrying",
              }
            : test.result;
        const user =
          test.userId &&
          db.query("SELECT 1 FROM users WHERE id=?").get(test.userId)
            ? test.userId
            : null;
        db.query("INSERT INTO door_tests VALUES(?,?,?,?,?,?)").run(
          test.id,
          test.doorId,
          user,
          JSON.stringify(outcome),
          Number(test.resolved),
          test.created,
        );
      }
    } else {
      const all = exportRecords(db, key, propertyId),
        doors = all.doors.filter((d) => d.data.propertyId === propertyId),
        doorIds = new Set(doors.map((d) => d.id));
      for (const c of doc.codes)
        if (c.grants.some((g) => !doorIds.has(g.doorId)))
          fail("Import the referenced doors into this structure first");
      const current = db
          .query("SELECT id FROM codes WHERE property_id=?")
          .all(propertyId) as { id: string }[],
        priorIds = new Set(current.map((c) => c.id));
      const codes = doc.codes.map((c) => ({
        ...c,
        data: { ...c.data, propertyId },
      }));
      const events = doc.events
        .filter((e) => mode === "replace" || !priorIds.has(e.codeId!))
        .map((e) => ({ ...e, propertyId }));
      const backup = backupSchema.parse({
        format: "oshost-json",
        version: 1,
        exportedAt: doc.exportedAt,
        properties: all.properties.filter((p) => p.id === propertyId),
        doors,
        codes,
        events,
        doorTests: [],
      });
      for (const e of events) {
        const existing = db
          .query("SELECT property_id,code_id FROM events WHERE id=?")
          .get(e.id) as any;
        if (
          existing &&
          (existing.property_id !== propertyId ||
            !priorIds.has(existing.code_id))
        )
          fail("A notification ID belongs to another record");
      }
      if (mode === "replace")
        for (const old of current) {
          deleteCode(db, old.id);
          result.removed++;
        }
      const restored = restoreRecords(db, key, backup, validateDevice);
      result.added = restored.codes;
      result.skipped = restored.skippedCodes;
      if (mode === "replace") {
        result.replaced = codes.filter((c) => priorIds.has(c.id)).length;
        result.added -= result.replaced;
        const incomingIds = new Set(codes.map((c) => c.id));
        result.removed = current.filter((c) => !incomingIds.has(c.id)).length;
      }
    }
    pruneNotifications(db);
    return result;
  })();
}
export function recordTransferRoutes(
  app: any,
  db: DB,
  key: string,
  owner: (c: any) => void,
  validateDevice: (kind: string, config: Record<string, string>) => void,
  validatePhotos: (data: any) => void,
) {
  for (const kind of ["doors", "codes"] as const) {
    app.get(`/api/v1/admin/records/${kind}/export`, (c: any) => {
      owner(c);
      const propertyId = z.uuid().parse(c.req.query("propertyId")),
        data = exportRecordList(db, key, kind, propertyId);
      if (
        Buffer.byteLength(JSON.stringify(data, null, 2)) >
        MAX_BACKUP_BYTES - 1024
      )
        fail("The exported JSON exceeds the 32 MB import limit", 413);
      c.header(
        "Content-Disposition",
        `attachment; filename="oshost-${kind}-${data.exportedAt.slice(0, 10)}.json"`,
      );
      c.header("Cache-Control", "no-store");
      return c.json(data);
    });
    app.post(`/api/v1/admin/records/${kind}/import`, async (c: any) => {
      owner(c);
      const text = await c.req.text();
      if (Buffer.byteLength(text) > MAX_BACKUP_BYTES)
        fail("Choose a JSON file smaller than 32 MB", 413);
      let raw;
      try {
        raw = JSON.parse(text);
      } catch {
        fail("Invalid JSON file", 400);
      }
      const input = z
        .object({
          propertyId: z.uuid(),
          mode: z.enum(["append", "replace"]).default("append"),
          confirmation: z.string().optional(),
          data: recordTransferSchema,
        })
        .strict()
        .parse(raw);
      if (
        !db
          .query(
            "SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.id=? AND u.role='owner' AND s.csrf=? AND s.expires>?",
          )
          .get(c.get("user").id, c.get("csrf"), Date.now())
      )
        fail("Authentication required", 401);
      if (
        input.mode === "replace" &&
        input.confirmation !== replacementConfirmation(kind)
      )
        fail("Type " + replacementConfirmation(kind) + " to confirm", 400);
      if (databaseLifecycle(db).active !== 1)
        fail("Another operation is running. Please try again shortly.");
      const result = importRecordList(
        db,
        key,
        kind,
        input.propertyId,
        input.data,
        input.mode,
        validateDevice,
        validatePhotos,
      );
      realtime(db).workspaceChanged();
      log("info", "records.imported", {
        count: result.added + result.replaced,
      });
      return c.json(result);
    });
  }
}
