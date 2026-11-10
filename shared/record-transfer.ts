import { z } from "zod";
import { backupSchema } from "./backup";
import { doorSchema } from "./schema";
const header = {
  version: z.literal(1),
  exportedAt: z.iso.datetime(),
  propertyId: z.uuid(),
};
export const doorTransferSchema = z
  .object({
    format: z.preprocess(
      (value) => (value === "oshost-doors" ? "guestin-doors" : value),
      z.literal("guestin-doors"),
    ),
    ...header,
    doors: z
      .array(
        z.object({
          id: z.uuid(),
          data: doorSchema.omit({ config: true }),
          config: z.record(z.string(), z.string()),
        }),
      )
      .max(100000),
    doorTests: backupSchema.shape.doorTests,
  })
  .strict()
  .superRefine((doc, ctx) => {
    const ids = new Set(doc.doors.map((d) => d.id));
    if (ids.size !== doc.doors.length)
      ctx.addIssue({ code: "custom", message: "Duplicate door IDs" });
    if (doc.doors.some((d) => d.data.propertyId !== doc.propertyId))
      ctx.addIssue({
        code: "custom",
        message: "Door belongs to another source structure",
      });
    if (doc.doorTests.some((t) => !ids.has(t.doorId)))
      ctx.addIssue({
        code: "custom",
        message: "Door test references a missing door",
      });
    if (new Set(doc.doorTests.map((t) => t.id)).size !== doc.doorTests.length)
      ctx.addIssue({ code: "custom", message: "Duplicate door test IDs" });
  });
export const codeTransferSchema = z
  .object({
    format: z.preprocess(
      (value) => (value === "oshost-codes" ? "guestin-codes" : value),
      z.literal("guestin-codes"),
    ),
    ...header,
    codes: backupSchema.shape.codes,
    events: backupSchema.shape.events,
  })
  .strict()
  .superRefine((doc, ctx) => {
    const ids = new Set(doc.codes.map((c) => c.id));
    if (ids.size !== doc.codes.length)
      ctx.addIssue({ code: "custom", message: "Duplicate access code IDs" });
    if (doc.codes.some((c) => c.data.propertyId !== doc.propertyId))
      ctx.addIssue({
        code: "custom",
        message: "Code belongs to another source structure",
      });
    if (
      doc.events.some(
        (e) =>
          !e.codeId || !ids.has(e.codeId) || e.propertyId !== doc.propertyId,
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Event references a code outside this file",
      });
  });
export const recordTransferSchema = z.union([
  doorTransferSchema,
  codeTransferSchema,
]);
export type RecordTransfer = z.infer<typeof recordTransferSchema>;
export type RecordKind = "doors" | "codes";
export const replacementConfirmation = (kind: RecordKind) =>
  kind === "doors" ? "REPLACE DOORS" : "REPLACE ACCESS CODES";
