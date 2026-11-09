import { z } from "zod";
export const propertySchema = z.object({
  name: z.string().min(1).max(120),
  timezone: z.string().refine((v) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, "Invalid timezone"),
  checkIn: z
    .string()
    .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
    .default("15:00"),
  checkOut: z
    .string()
    .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
    .default("11:00"),
});
export const doorSchema = z.object({
  propertyId: z.string(),
  name: z.string().min(1),
  enabled: z.boolean().default(true),
  description: z.string().max(5000).default(""),
  descriptionTranslations: z
    .record(z.string(), z.string().max(5000))
    .default({}),
  photos: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        url: z
          .string()
          .max(1500000)
          .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/),
        alt: z.string().max(300).default(""),
      }),
    )
    .max(4)
    .default([]),
  primaryPhotoId: z.string().nullable().default(null),
  order: z.number().int().nonnegative().default(0),
  common: z.boolean().default(false),
  singleUse: z.boolean().default(false),
  integration: z.enum(["none", "ewelink", "shelly"]),
  config: z.record(z.string(), z.string()),
  translations: z.record(z.string(), z.string()).default({}),
});
export const grantSchema = z
  .object({
    doorId: z.string(),
    start: z.iso.datetime().transform((v) => new Date(v).toISOString()),
    end: z.iso.datetime().transform((v) => new Date(v).toISOString()),
    singleUse: z.boolean(),
    active: z.boolean().optional(),
  })
  .refine((v) => v.start < v.end, "Start must precede end");
export const codeSchema = z.object({
  propertyId: z.string(),
  label: z.string().min(1).max(200),
  notes: z.string().max(5000).default(""),
  checkinLink: z.string().default(""),
  instructionsLink: z.string().default(""),
  grants: z.array(grantSchema),
  breakfast: z
    .object({
      total: z.number().int().nonnegative(),
      start: z.iso.date(),
      end: z.iso.date(),
    })
    .refine((v) => v.start <= v.end)
    .nullable()
    .default(null),
});
export type AccessCodeDraft = z.input<typeof codeSchema>;
export type DeviceResult = {
  status: "accepted" | "failed" | "uncertain";
  detail: string;
};
export const defaultTemplates = {
  en: {
    access:
      "Hello {{guest}},\nHere is your door access link:\n{{link}}\nPlease check each door’s validity and single-use notice.",
    checkin:
      "Hello {{guest}},\nPlease complete online check-in:\n{{checkinLink}}",
    instructions:
      "Hello {{guest}},\nYour arrival instructions:\n{{instructionsLink}}",
  },
  it: {
    access:
      "Ciao {{guest}},\nEcco il link per accedere alle porte:\n{{link}}\nControlla la validità e gli avvisi di uso singolo.",
    checkin: "Ciao {{guest}},\nCompleta il check-in online:\n{{checkinLink}}",
    instructions:
      "Ciao {{guest}},\nLe istruzioni per il tuo arrivo:\n{{instructionsLink}}",
  },
};
export function localDate(timezone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
