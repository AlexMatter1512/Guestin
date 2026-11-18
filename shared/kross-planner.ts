export type KrossPlannerRoom = { id: string; name: string; color?: string };
export type KrossPlannerReservation = {
  id_reservation: number;
  blockId?: number;
  roomId: string;
  roomNames: string[];
  row: number;
  label: string;
  // These dates describe the bar shown in the requested window.
  arrival: string;
  departure: string;
  color?: string;
  textColor?: string;
  channel?: string;
};
export type KrossPlanner = {
  rooms: KrossPlannerRoom[];
  reservations: KrossPlannerReservation[];
};

function color(value: unknown) {
  const match =
    typeof value === "string" &&
    /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(value.trim());
  return match ? `#${match[1]}` : undefined;
}

function collection(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object")
    throw Error("KrossBooking returned an unreadable planner. Try again.");
  return value as Record<string, any>;
}

// Provider dates are hotel-local calendar labels paired with Unix seconds. A
// UTC conversion of the timestamp alone can shift the stay back by one day.
function plannerDate(label: unknown, month: string) {
  if (typeof label !== "string") return null;
  const parts = /^(\d{1,2})\/(\d{1,2})$/.exec(label);
  if (!parts) return null;
  const requestedMonth = Number(month.slice(5));
  const monthNumber = Number(parts[2]);
  let year = Number(month.slice(0, 4));
  if (monthNumber - requestedMonth > 6) year--;
  if (requestedMonth - monthNumber > 6) year++;
  const iso = `${year}-${parts[2].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) && new Date(ms).toISOString().startsWith(iso)
    ? iso
    : null;
}

export function plannerRoomKey(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\b(?:room|camera|stanza|door|porta)\b/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function krossPlanner(response: any, month: string): KrossPlanner {
  const data = response?.data;
  if (data?.result === false)
    throw Error("KrossBooking could not load the planner.");
  const slots = collection(data?.planner);
  const dates = new Map<string, string>();
  const firstDayMs =
    typeof data.start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.start)
      ? Date.parse(data.start)
      : NaN;
  const firstTimestamp = Number(data.start_timestamp);
  for (const day of Object.values(collection(data.dates))) {
    if (day?.timestamp == null) continue;
    // Match the provider's local midnight. Rounding elapsed days compensates
    // for the hour gained or lost across a daylight-saving transition.
    const offset = Math.round((Number(day.timestamp) - firstTimestamp) / 86400);
    const aligned = new Date(firstDayMs + offset * 86400000);
    const iso =
      data.start_timestamp != null && Number.isFinite(aligned.getTime())
        ? aligned.toISOString().slice(0, 10)
        : plannerDate(day.date, month);
    if (!iso) throw Error("KrossBooking returned an unreadable planner date.");
    dates.set(String(day.timestamp), iso);
  }
  const seenRooms = new Set<string>();
  const rooms: KrossPlannerRoom[] = [];
  for (const room of Object.values(collection(data.rooms))) {
    if (room?.id_room == null) continue;
    const id = String(room.id_room);
    if (seenRooms.has(id)) continue;
    seenRooms.add(id);
    const aliases = [room.label_room, room.number, room.name_room_type]
      .filter((value) => typeof value === "string" || typeof value === "number")
      .map((value) => String(value).trim())
      .filter(Boolean);
    rooms.push({ id, name: aliases[0] ?? id, color: color(room.room_color) });
  }
  const reservations: KrossPlannerReservation[] = [];
  for (const room of rooms) {
    const rows = Object.values(collection(slots[room.id] ?? []));
    for (const [index, row] of rows.entries()) {
      for (const [timestamp, slot] of Object.entries(collection(row))) {
        const reservationId = Number(slot?.id_reservation);
        const blockId = Number(slot?.id_room_block);
        const isReservation =
          Number.isSafeInteger(reservationId) && reservationId > 0;
        if (!isReservation && !(Number.isSafeInteger(blockId) && blockId > 0))
          continue;
        const arrival = dates.get(timestamp);
        const size = Number(slot.size ?? 1);
        if (!arrival || !Number.isSafeInteger(size) || size < 1) continue;
        const end = new Date(Date.parse(arrival) + size * 86400000);
        if (!Number.isFinite(end.getTime())) continue;
        reservations.push({
          roomId: room.id,
          roomNames: [room.name],
          id_reservation: isReservation ? reservationId : 0,
          ...(!isReservation && { blockId }),
          row: index + 1,
          label: String(slot.reservation ?? ""),
          arrival,
          departure: end.toISOString().slice(0, 10),
          color: color(slot.bg_color),
          textColor: color(slot.text_color),
          channel:
            slot.channel || slot.name_channel || slot.cod_channel || undefined,
        });
      }
    }
  }
  return { rooms, reservations };
}
