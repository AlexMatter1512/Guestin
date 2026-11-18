import { z } from "zod";
import { formatDate, formatDateTime, type DateFormat } from "./date-format";
import { codeSchema } from "./schema";

const door = z.object({ door: z.string() });
const changes = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("label"),
    from: codeSchema.shape.label,
    to: codeSchema.shape.label,
  }),
  z.object({ kind: z.literal("staff"), staff: z.boolean() }),
  z.object({ kind: z.enum(["notes", "checkinLink", "instructionsLink"]) }),
  z.object({
    kind: z.literal("breakfast"),
    from: codeSchema.shape.breakfast.unwrap(),
    to: codeSchema.shape.breakfast.unwrap(),
  }),
  door.extend({ kind: z.enum(["doorAdded", "doorRemoved"]) }),
  door.extend({
    kind: z.enum(["doorStart", "doorEnd"]),
    from: z.iso.datetime(),
    to: z.iso.datetime(),
  }),
  door.extend({ kind: z.literal("singleUse"), enabled: z.boolean() }),
]);
export const accessCodeChangesSchema = z.array(changes);
export type AccessCodeChange = z.infer<typeof changes>;

export function describeAccessCodeChange(
  change: AccessCodeChange,
  italian: boolean,
  format: DateFormat,
  timezone: string,
): string {
  switch (change.kind) {
    case "label":
      return italian
        ? `Nome: ${change.from} → ${change.to}`
        : `Label: ${change.from} → ${change.to}`;
    case "staff":
      return change.staff
        ? italian
          ? "Convertito in codice staff"
          : "Changed to a staff code"
        : italian
          ? "Convertito in codice ospite"
          : "Changed to a guest code";
    case "notes":
      return italian ? "Note aggiornate" : "Notes updated";
    case "checkinLink":
      return italian ? "Link di check-in aggiornato" : "Check-in link updated";
    case "instructionsLink":
      return italian
        ? "Link alle istruzioni aggiornato"
        : "Instructions link updated";
    case "breakfast": {
      const allocation = (value: typeof change.from) => {
        if (!value) return italian ? "nessuna" : "none";
        const start = formatDate(value.start, format);
        const end = formatDate(value.end, format);
        return `${value.total} (${start === end ? start : `${start}–${end}`})`;
      };
      return `${italian ? "Colazioni" : "Breakfast allocation"}: ${allocation(change.from)} → ${allocation(change.to)}`;
    }
    case "doorAdded":
      return italian
        ? `Porta aggiunta: ${change.door}`
        : `Door added: ${change.door}`;
    case "doorRemoved":
      return italian
        ? `Porta rimossa: ${change.door}`
        : `Door removed: ${change.door}`;
    case "doorStart":
    case "doorEnd": {
      const field =
        change.kind === "doorStart"
          ? italian
            ? "inizio validità"
            : "valid from"
          : italian
            ? "fine validità"
            : "valid until";
      const from = formatDateTime(change.from, format, timezone);
      const to = formatDateTime(change.to, format, timezone);
      if (from === to)
        return `${change.door}, ${field}: ${change.from} → ${change.to}`;
      return `${change.door}, ${field}: ${from} → ${to}`;
    }
    case "singleUse": {
      const mode = change.enabled
        ? italian
          ? "uso singolo"
          : "single use"
        : italian
          ? "usi multipli"
          : "multiple uses";
      return `${change.door}: ${mode}`;
    }
  }
}
