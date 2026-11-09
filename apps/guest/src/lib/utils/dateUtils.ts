/** Original BnB date presentation, with property-timezone instants and date-only safety. */
export function formatDate(value: Date | string, timezone?: string): string {
  const dateOnly =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: dateOnly ? "UTC" : timezone,
  }).format(new Date(value));
}
export function formatDateTime(
  value: Date | string,
  timezone?: string,
): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  })
    .format(new Date(value))
    .replace(", ", " ");
}
