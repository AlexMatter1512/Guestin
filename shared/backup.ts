import { z } from "zod";
import { propertySchema, doorSchema, codeSchema } from "./schema";
export const MAX_BACKUP_BYTES = 32 * 1024 * 1024;
const id = z.uuid();
const counter = z.number().int().nonnegative();
const deviceResult = z.object({
  status: z.enum(["pending", "accepted", "failed", "uncertain"]),
  detail: z.string().max(10000),
});
const action = z.object({
  id,
  kind: z.enum(["door", "breakfast"]),
  target: z.string().max(1000),
  result: z.union([deviceResult, z.object({ remaining: counter })]),
});
const grant = z
  .object({
    doorId: id,
    start: z.iso.datetime(),
    end: z.iso.datetime(),
    singleUse: z.boolean(),
    active: z.boolean(),
    used: counter,
    claim: id.nullable(),
  })
  .refine((g) => g.start < g.end, "Invalid door validity");
const passwordHash = z
  .string()
  .max(500)
  .refine((value) => {
    const match =
      /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/.exec(
        value,
      );
    return (
      !!match &&
      Number(match[1]) >= 8 * Number(match[3]) &&
      Number(match[1]) <= 262144 &&
      Number(match[2]) >= 1 &&
      Number(match[2]) <= 10 &&
      Number(match[3]) >= 1 &&
      Number(match[3]) <= 8
    );
  }, "Invalid breakfast password hash");
export const backupSchema = z
  .object({
    format: z.literal("oshost-json"),
    version: z.literal(1),
    exportedAt: z.iso.datetime(),
    properties: z
      .array(
        z.object({
          id,
          data: propertySchema,
          retentionMonths: z.number().int().min(1).max(120).default(3),
          breakfastPassword: passwordHash.nullable().default(null),
          templates: z
            .record(z.string(), z.record(z.string(), z.string().max(10000)))
            .optional(),
        }),
      )
      .max(10000),
    doors: z
      .array(
        z.object({
          id,
          data: doorSchema.omit({
            config: true,
            photos: true,
            primaryPhotoId: true,
          }),
          config: z.record(z.string(), z.string()),
        }),
      )
      .max(100000),
    codes: z
      .array(
        z.object({
          id,
          data: codeSchema.omit({ grants: true }),
          token: z
            .string()
            .min(32)
            .max(512)
            .regex(/^[A-Za-z0-9_-]+$/),
          revoked: z.boolean(),
          created: z.iso.datetime(),
          creatorId: id.nullable(),
          creatorName: z.string().max(200).nullable(),
          grants: z.array(grant),
          redemptions: z.array(
            z.object({
              id,
              quantity: z.number().int().min(1).max(1000),
              date: z.iso.date(),
              created: z.iso.datetime(),
            }),
          ),
          actions: z.array(action),
          metrics: z
            .object({ attempts: counter, accepted: counter })
            .refine((m) => m.accepted <= m.attempts, "Invalid usage counters"),
        }),
      )
      .max(100000),
    doorTests: z
      .array(
        z.object({
          id,
          doorId: id,
          userId: id.nullable(),
          result: deviceResult,
          resolved: z.boolean(),
          created: z.iso.datetime(),
        }),
      )
      .default([]),
    events: z
      .array(
        z.object({
          id,
          propertyId: id.nullable(),
          codeId: id.nullable(),
          type: z.string().max(120),
          message: z.string().max(10000),
          created: z.iso.datetime(),
          context: z
            .object({
              codeLabel: z.string().max(200).optional(),
              validFrom: z.iso.datetime().optional(),
              validTo: z.iso.datetime().optional(),
              timezone: propertySchema.shape.timezone.optional(),
              doorName: z.string().optional(),
              actor: z.string().optional(),
              detail: z.string().optional(),
              action: z.enum(["page", "door", "breakfast"]).optional(),
              suppressedAttempts: z.number().int().nonnegative().optional(),
              previousVisit: z
                .object({ label: z.string().max(120), date: z.iso.datetime() })
                .optional(),
            })
            .default({}),
        }),
      )
      .default([]),
  })
  .superRefine((backup, ctx) => {
    const problem = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    const unique = (values: string[], name: string) => {
      if (new Set(values).size !== values.length) problem(`Duplicate ${name}`);
    };
    unique(
      backup.properties.map((v) => v.id),
      "structures",
    );
    unique(
      backup.doors.map((v) => v.id),
      "doors",
    );
    unique(
      backup.codes.map((v) => v.id),
      "codes",
    );
    unique(
      backup.codes.map((v) => v.token),
      "guest tokens",
    );
    unique(
      backup.codes.flatMap((v) => v.redemptions.map((r) => r.id)),
      "redemptions",
    );
    unique(
      backup.codes.flatMap((v) => v.actions.map((r) => r.id)),
      "actions",
    );
    unique(
      backup.doorTests.map((v) => v.id),
      "door tests",
    );
    unique(
      backup.events.map((v) => v.id),
      "events",
    );
    const properties = new Set(backup.properties.map((p) => p.id)),
      doors = new Map(backup.doors.map((d) => [d.id, d]));
    const codes = new Map(backup.codes.map((c) => [c.id, c]));
    for (const door of backup.doors)
      if (!properties.has(door.data.propertyId))
        problem("Door references a missing structure");
    for (const code of backup.codes) {
      if (!properties.has(code.data.propertyId))
        problem("Code references a missing structure");
      unique(
        code.grants.map((g) => g.doorId),
        "door permissions",
      );
      const used = code.redemptions.reduce((sum, r) => sum + r.quantity, 0);
      if (used > (code.data.breakfast?.total ?? 0))
        problem("Breakfast allocation is below recorded usage");
      for (const grant of code.grants) {
        if (doors.get(grant.doorId)?.data.propertyId !== code.data.propertyId)
          problem("Door permission is outside the code structure");
        if (
          grant.claim &&
          !code.actions.some(
            (a) =>
              a.id === grant.claim &&
              a.kind === "door" &&
              a.target === grant.doorId &&
              "status" in a.result &&
              ["pending", "uncertain"].includes(a.result.status),
          )
        )
          problem("Unresolved door request has no matching action");
      }
      for (const redemption of code.redemptions)
        if (
          !code.actions.some(
            (a) =>
              a.id === redemption.id &&
              a.kind === "breakfast" &&
              a.target === String(redemption.quantity) &&
              "remaining" in a.result,
          )
        )
          problem("Breakfast redemption has no matching action");
      for (const action of code.actions) {
        if (
          action.kind === "breakfast" &&
          (!("remaining" in action.result) ||
            !code.redemptions.some((r) => r.id === action.id))
        )
          problem("Breakfast action has no matching redemption");
        if (action.kind === "door" && !("status" in action.result))
          problem("Invalid door action result");
      }
    }
    for (const test of backup.doorTests)
      if (!doors.has(test.doorId))
        problem("Door test references a missing door");
    for (const event of backup.events) {
      if (event.propertyId && !properties.has(event.propertyId))
        problem("Event references a missing structure");
      if (
        event.codeId &&
        (!codes.has(event.codeId) ||
          codes.get(event.codeId)!.data.propertyId !== event.propertyId)
      )
        problem("Event references a missing or unrelated code");
    }
  });
export type PortableBackup = z.infer<typeof backupSchema>;
