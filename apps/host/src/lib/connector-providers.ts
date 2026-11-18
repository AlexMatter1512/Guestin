import { CalendarDays, Image, Plug } from "@lucide/svelte";

export const connectorProviders = [
  { id: "kross", name: "KrossBooking", icon: Plug },
  { id: "ical", name: "iCal", icon: CalendarDays },
  { id: "ai", name: "AI", icon: Image },
] as const;

export function matchesKind(connection: { kind: string }, kind: string) {
  return (
    connection.kind === kind || (kind === "ai" && connection.kind === "gemini")
  );
}
