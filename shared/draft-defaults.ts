import type { AccessCodeDraft } from "./schema";
import { localDate } from "./schema";

export function guestLinkDefaults(
  property:
    | { defaultCheckinLink?: string; defaultInstructionsLink?: string }
    | undefined,
  source?: Partial<AccessCodeDraft>,
) {
  return {
    checkinLink:
      source?.checkinLink?.trim() || property?.defaultCheckinLink || "",
    instructionsLink:
      source?.instructionsLink?.trim() ||
      property?.defaultInstructionsLink ||
      "",
  };
}
export function nextDate(date: string) {
  return new Date(Date.parse(date + "T12:00:00Z") + 86400000)
    .toISOString()
    .slice(0, 10);
}
export function breakfastDefaults(
  draft: Partial<AccessCodeDraft>,
  timezone: string,
  now = new Date(),
) {
  const starts = (draft.grants ?? [])
    .map((g) => localDate(timezone, new Date(g.start)))
    .sort();
  const ends = (draft.grants ?? [])
    .map((g) => localDate(timezone, new Date(g.end)))
    .sort();
  const start = nextDate(starts[0] ?? localDate(timezone, now));
  return {
    total: 1,
    start,
    end: ends.at(-1) && ends.at(-1)! >= start ? ends.at(-1)! : start,
  };
}
