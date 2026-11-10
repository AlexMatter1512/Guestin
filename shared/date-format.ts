export const dateFormats = ["dd/mm/yyyy", "mm/dd/yyyy", "yyyy-mm-dd"] as const;
export type DateFormat = (typeof dateFormats)[number];
export const DEFAULT_DATE_FORMAT: DateFormat = "dd/mm/yyyy";
export function formatDate(
  value: string | Date | number,
  format: DateFormat = DEFAULT_DATE_FORMAT,
  timezone?: string,
) {
  const only = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: only ? "UTC" : timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date(value));
  const get = (key: string) => parts.find((p) => p.type === key)?.value ?? "";
  const d = get("day"),
    m = get("month"),
    y = get("year");
  return format === "mm/dd/yyyy"
    ? `${m}/${d}/${y}`
    : format === "yyyy-mm-dd"
      ? `${y}-${m}-${d}`
      : `${d}/${m}/${y}`;
}
export function formatDateTime(
  value: string | Date | number,
  format: DateFormat = DEFAULT_DATE_FORMAT,
  timezone?: string,
) {
  return (
    formatDate(value, format, timezone) +
    " " +
    new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(value))
  );
}
export function parseDisplayDate(
  value: string,
  format: DateFormat,
  withTime = false,
): string | null {
  let date: string,
    time = "";
  const parts = value.trim().split(/[ T]/);
  if (withTime) {
    if (parts.length !== 2 || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(parts[1]))
      return null;
    time = "T" + parts[1];
  } else if (parts.length !== 1) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(parts[0])) date = parts[0];
  else {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(parts[0]);
    if (!match || format === "yyyy-mm-dd") return null;
    date =
      format === "mm/dd/yyyy"
        ? `${match[3]}-${match[1]}-${match[2]}`
        : `${match[3]}-${match[2]}-${match[1]}`;
  }
  const parsed = new Date(date + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
    ? date + time
    : null;
}
