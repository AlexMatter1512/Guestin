import { z } from "zod";
import {
  builtInGuestCopy,
  guestPageLanguages,
  type GuestCopyKind,
  type GuestPageLanguage,
} from "./guest-page-copy";

export const guestMarkdownLimit = 5000;
export const defaultGuestAccent = "#047857";
const hexColor = /^#[0-9a-f]{6}$/i;

const languageSchema = z.enum(
  Object.keys(guestPageLanguages) as GuestPageLanguage[],
);
const markdownSchema = z.string().trim().max(guestMarkdownLimit);
const localizedCopySchema = z.object({
  defaultLanguage: languageSchema.default("en"),
  translations: z
    .partialRecord(languageSchema, markdownSchema)
    .default({})
    .transform(
      (translations) =>
        Object.fromEntries(
          Object.entries(translations).filter(([, text]) => text),
        ) as Partial<Record<GuestPageLanguage, string>>,
    ),
});

export type GuestLocalizedCopy = z.infer<typeof localizedCopySchema>;
export const guestPageSchema = z
  .object({
    showLogo: z.boolean().default(false),
    accentColor: z
      .string()
      .regex(hexColor, "Choose a valid accent color")
      .nullable()
      .default(null),
    intro: localizedCopySchema.optional(),
    singleUse: localizedCopySchema.optional(),
    introMarkdown: markdownSchema.optional(),
    singleUseMarkdown: markdownSchema.optional(),
  })
  .transform(
    ({ intro, singleUse, introMarkdown, singleUseMarkdown, ...branding }) => ({
      ...branding,
      intro: intro ?? {
        defaultLanguage: "en" as const,
        translations: introMarkdown ? { en: introMarkdown } : {},
      },
      singleUse: singleUse ?? {
        defaultLanguage: "en" as const,
        translations: singleUseMarkdown ? { en: singleUseMarkdown } : {},
      },
    }),
  );

export type GuestPageSettings = z.infer<typeof guestPageSchema>;
export const defaultGuestPage = guestPageSchema.parse({});
export const guestPageHistoryLimit = 10;
export const guestPageVersionSchema = z.object({
  savedAt: z.iso.datetime().nullable(),
  guestPage: guestPageSchema,
});
export type GuestPageVersion = z.infer<typeof guestPageVersionSchema>;
export const guestPageHistorySchema = z
  .array(guestPageVersionSchema)
  .max(guestPageHistoryLimit);

export function recordGuestPageVersion(
  property: {
    guestPage?: unknown;
    guestPageHistory?: unknown;
    guestPageUpdatedAt?: string;
  },
  guestPage: GuestPageSettings,
  savedAt: string,
) {
  const current = guestPageSchema.parse(property.guestPage ?? {});
  const existing = guestPageHistorySchema.safeParse(
    property.guestPageHistory ?? [],
  );
  const history = existing.success ? existing.data : [];
  const languages = Object.keys(guestPageLanguages) as GuestPageLanguage[];
  const same =
    current.showLogo === guestPage.showLogo &&
    current.accentColor === guestPage.accentColor &&
    (["intro", "singleUse"] as const).every(
      (key) =>
        current[key].defaultLanguage === guestPage[key].defaultLanguage &&
        languages.every(
          (language) =>
            (current[key].translations[language] ?? "") ===
            (guestPage[key].translations[language] ?? ""),
        ),
    );
  return {
    guestPage,
    guestPageUpdatedAt: same ? property.guestPageUpdatedAt : savedAt,
    guestPageHistory: same
      ? history
      : [
          { savedAt: property.guestPageUpdatedAt ?? null, guestPage: current },
          ...history,
        ].slice(0, guestPageHistoryLimit),
  };
}

export function resolveGuestCopy(
  copy: GuestLocalizedCopy,
  kind: GuestCopyKind,
  language: GuestPageLanguage,
) {
  const direct = copy.translations[language];
  if (direct) return direct;
  const defaultText = copy.translations[copy.defaultLanguage];
  if (defaultText) return defaultText;
  const fallback =
    copy.defaultLanguage !== "en" ||
    Object.values(copy.translations).some(Boolean)
      ? copy.defaultLanguage
      : language;
  return builtInGuestCopy[fallback][kind];
}

export const guestPreviewDoorLimit = 50;

export const propertyLogoSchema = z
  .string()
  .max(400000)
  .refine((logo) => {
    const match =
      /^data:image\/(png|jpeg|webp);base64,([a-z0-9+/]+={0,2})$/i.exec(logo);
    if (!match || match[2].length % 4 !== 0) return false;
    const signature = atob(match[2].slice(0, 16));
    if (match[1] === "png") return signature.startsWith("\x89PNG\r\n\x1a\n");
    if (match[1] === "jpeg") return signature.startsWith("\xff\xd8\xff");
    return signature.startsWith("RIFF") && signature.slice(8, 12) === "WEBP";
  }, "Use a PNG, JPEG or WebP logo under 300 KB")
  .nullable();

export function guestPageView(property: {
  guestPage?: unknown;
  logo?: unknown;
}) {
  const parsed = guestPageSchema.safeParse(property.guestPage ?? {});
  const settings = parsed.success ? parsed.data : defaultGuestPage;
  const logo = settings.showLogo
    ? propertyLogoSchema.safeParse(property.logo)
    : undefined;
  return { ...settings, logo: logo?.success ? logo.data : null };
}

export function makeGuestPreview(
  property: {
    name: string;
    timezone: string;
    guestPage?: unknown;
    logo?: unknown;
  },
  doors: {
    id: string;
    name: string;
    singleUse?: boolean;
    order?: number;
    description?: string;
    descriptionTranslations?: Record<string, string>;
    photos?: { id: string; url: string; alt?: string }[];
    primaryPhotoId?: string | null;
    translations?: Record<string, string>;
  }[],
  dateFormat: string,
) {
  return {
    preview: true,
    label: "Demo guest",
    property: property.name,
    guestPage: guestPageView(property),
    timezone: property.timezone,
    dateFormat,
    doors: doors
      .map((door) => ({
        id: door.id,
        name: door.name,
        description: door.description,
        descriptionTranslations: door.descriptionTranslations,
        photos: door.photos,
        primaryPhotoId: door.primaryPhotoId,
        translations: door.translations,
        singleUse: !!door.singleUse,
        order: door.order ?? 0,
        configured: true,
        active: true,
        enabled: true,
        start: "",
        end: "",
        timeUnrestricted: true,
      }))
      .sort((a, b) => a.order - b.order),
  };
}

export function guestAccentText(color: string) {
  const channels = [1, 3, 5].map((offset) => {
    const channel = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance =
    0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.05
    ? "#fff"
    : "#000";
}
