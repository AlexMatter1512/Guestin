import ICAL from "ical.js";
import { z } from "zod";
import type { AccessCodeDraft } from "./schema";
export interface DraftConnector {
  name: string;
  load(): Promise<Partial<AccessCodeDraft>[]>;
}
export type Transport = (
  path: string,
  body: Record<string, unknown>,
) => Promise<any>;
export type KrossVerificationDevice = {
  [key: string]: unknown;
  "2fa_type": string;
  "2fa_id"?: string | number;
  "2fa_device"?: string;
};
function providerError(payload: any) {
  const failed = (value: unknown) =>
    value !== undefined &&
    value !== null &&
    value !== false &&
    value !== 0 &&
    value !== "0" &&
    value !== "";
  if (
    failed(payload?.error) ||
    failed(payload?.error_code) ||
    payload?.success === false
  )
    throw Error(
      String(
        payload.error_message ??
          payload.message ??
          (typeof payload.error === "string"
            ? payload.error
            : "KrossBooking rejected this request. Check your details and try again."),
      ),
    );
  return payload;
}
export class KrossClient {
  constructor(
    private request: Transport,
    public hotelId: string,
    public deviceId: string,
  ) {}
  private async authenticate(
    username: string,
    password: string,
    extra: Record<string, unknown> = {},
  ) {
    if (!this.hotelId.trim() || !username.trim() || !password)
      throw Error("Enter your KrossBooking hotel ID, username and password.");
    if (!this.deviceId) throw Error("A stable device identity is required.");
    // Match krossApy's working default v5 request exactly. Keep deviceId as
    // stable local connector metadata: sending a fabricated mobile device_id /
    // deviceSystem profile reaches OTP delivery but fails verification upstream.
    // Passwords and verification codes remain transient.
    return providerError(
      await this.request("/auth/get-token", {
        ...extra,
        hotel_id: this.hotelId.trim(),
        username: username.trim(),
        password,
        api_key: "apf6phf4eeb70da55fa972e3b7g403d4",
        with_priv: true,
        app: "krossapp",
        type: "FCM",
      }),
    );
  }
  async login(
    username: string,
    password: string,
    extra: Record<string, unknown> = {},
  ) {
    const response = await this.authenticate(username, password, extra);
    if (!response.authenticated && !response.auth_token && !response["2fa"])
      throw Error(
        "KrossBooking did not confirm the login. Check the hotel ID and credentials.",
      );
    return response;
  }
  requestTwoFactor(
    username: string,
    password: string,
    device: KrossVerificationDevice,
  ) {
    if (!device?.["2fa_type"]) throw Error("Select a verification method.");
    return this.authenticate(
      username,
      password,
      Object.fromEntries(
        ["2fa_type", "2fa_id", "2fa_device"]
          .filter((k) => k in device)
          .map((k) => [k, (device as any)[k]]),
      ),
    );
  }
  completeTwoFactor(
    username: string,
    password: string,
    device: KrossVerificationDevice,
    code: string,
    trust = false,
  ) {
    if (!device?.["2fa_type"] || !code.trim())
      throw Error(
        "Enter the verification code sent to your selected destination.",
      );
    return this.login(username, password, {
      "2fa_type": device["2fa_type"],
      "2fa_code": code.trim(),
      "2fa_trust": trust,
    });
  }
  async properties() {
    return providerError(
      await this.request("/properties/get-list", { with_app_flags: true }),
    );
  }
  async search(body: Record<string, unknown>) {
    // The v5 field is `query`, not the old UI's `search` parameter.
    const { search, ...input } = body;
    return providerError(
      await this.request("/app/search-reservation", {
        ...input,
        query: input.query ?? search ?? "",
      }),
    );
  }
  async dashboard(
    bucket: "arrivals" | "departures" | "stays" | "booked",
    id_property: number,
    date: string,
    page = 0,
  ) {
    if (
      !["arrivals", "departures", "stays", "booked"].includes(bucket) ||
      !Number.isInteger(page) ||
      page < 0
    )
      throw Error("Invalid KrossBooking list or page.");
    return providerError(
      await this.request(`/app/dashboard-${bucket}?page=${page}`, {
        id_property,
        date,
        page,
        type: bucket,
      }),
    );
  }
  arrivals(id_property: number, date: string, page = 0) {
    return this.dashboard("arrivals", id_property, date, page);
  }
  async reservation(id_reservation: number, lang = "en") {
    return providerError(
      await this.request("/app/get-reservation", { id_reservation, lang }),
    );
  }
}

// v5 wrappers from krossApy and BnBScraper/dbWriter.py. Keep external records
// temporary: these helpers return display data/drafts, never save any code.
export function krossProperties(response: any): any[] {
  const data = response?.data ?? response;
  const properties = Array.isArray(data) ? data : data?.properties;
  if (!Array.isArray(properties))
    throw Error(
      "KrossBooking returned an unreadable property list. Try again.",
    );
  return properties.filter((p) => p && p.id_property !== undefined);
}
export function krossReservations(response: any): {
  items: any[];
  hasNextPage: boolean;
} {
  const data = response?.data ?? response;
  const items = Array.isArray(data)
    ? data
    : (data?.reservations ??
      data?.items ??
      data?.arrivals ??
      data?.departures ??
      data?.stays ??
      data?.booked);
  if (!Array.isArray(items))
    throw Error(
      "KrossBooking returned an unreadable reservation list. Try again.",
    );
  const hasNext = response?.has_next_page ?? data?.has_next_page;
  return {
    items,
    hasNextPage: hasNext === true || hasNext === 1 || hasNext === "1",
  };
}
function reservationDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/.exec(value);
  const local = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(value);
  const date = iso
    ? `${iso[1]}-${iso[2]}-${iso[3]}`
    : local
      ? `${local[3]}-${local[2]}-${local[1]}`
      : null;
  return date &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date
    ? date
    : null;
}
export function krossReservationDraft(
  response: any,
  options: {
    propertyId: string;
    timezone: string;
    checkIn: string;
    checkOut: string;
    doors: any[];
  },
  summary: any = {},
): Partial<AccessCodeDraft> {
  const detail =
    response?.data?.reservation ?? response?.reservation ?? response;
  if (!detail || typeof detail !== "object")
    throw Error("KrossBooking returned unreadable reservation details.");
  const start = reservationDate(detail.arrival ?? summary.arrival),
    end = reservationDate(detail.departure ?? summary.departure);
  let rooms: string[] = Array.isArray(detail.rooms)
    ? detail.rooms.flatMap((room: any) => {
        const value =
          typeof room === "string"
            ? room
            : (room?.number ?? room?.name_room_type ?? room?.name);
        return value === undefined || value === null ? [] : [String(value)];
      })
    : [];
  if (!rooms.length) {
    let source = summary.name_room_type ?? detail.name_room_type ?? [];
    if (typeof source === "string") {
      try {
        source = JSON.parse(source);
      } catch {
        source = source.split(",");
      }
    }
    rooms = (Array.isArray(source) ? source : [source]).map(String);
  }
  const names = rooms.map((name) => name.trim().toLocaleLowerCase());
  const missingDates = !start || !end || end <= start;
  const grants = missingDates
    ? []
    : options.doors
        .filter(
          (d) =>
            d.propertyId === options.propertyId &&
            d.enabled !== false &&
            (d.common ||
              names.includes(String(d.name).trim().toLocaleLowerCase())),
        )
        .map((d) => ({
          doorId: d.id,
          start: wallTime(start!, options.checkIn, options.timezone),
          end: wallTime(end!, options.checkOut, options.timezone),
          singleUse: !!d.singleUse,
        }));
  const total = Number(detail.n_breakfasts ?? detail.breakfast_total);
  const breakfastStart =
    start &&
    new Date(Date.parse(start + "T12:00:00Z") + 86400000)
      .toISOString()
      .slice(0, 10);
  const breakfast =
    !missingDates &&
    Number.isInteger(total) &&
    total > 0 &&
    breakfastStart! <= end!
      ? { total, start: breakfastStart!, end: end! }
      : null;
  return {
    propertyId: options.propertyId,
    label: String(detail.label ?? summary.label ?? ""),
    grants,
    breakfast,
    checkinLink: String(detail.link_guest_portal ?? detail.link_summary ?? ""),
    instructionsLink: String(detail.link_check_in_instructions ?? ""),
    notes: missingDates
      ? "KrossBooking draft — dates are missing or invalid. Enter dates and select doors manually."
      : "KrossBooking draft — review guest name, door mapping, dates and breakfast before saving.",
  };
}
export function wallTime(date: string, time: string, timezone: string) {
  const desired = Date.parse(date + "T" + time + ":00Z");
  let guess = desired;
  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat("sv-SE", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .format(new Date(guess))
      .replace(" ", "T");
    const difference = desired - Date.parse(parts + "Z");
    if (!difference) return new Date(guess).toISOString();
    guess += difference;
  }
  throw Error("This local time does not exist; select another time");
}
export function calendarDrafts(
  text: string,
  options: {
    propertyId: string;
    doorId: string;
    timezone: string;
    checkIn: string;
    checkOut: string;
    singleUse: boolean;
  },
  from = new Date(),
  max = 200,
): Partial<AccessCodeDraft>[] {
  const component = new ICAL.Component(ICAL.parse(text));
  for (const tz of component.getAllSubcomponents("vtimezone"))
    ICAL.TimezoneService.register(new ICAL.Timezone(tz));
  const drafts: Partial<AccessCodeDraft>[] = [];
  const events = component.getAllSubcomponents("vevent");
  for (const sub of events) {
    if (sub.getFirstPropertyValue("recurrence-id")) continue;
    const event = new ICAL.Event(sub);
    for (const exception of events.filter(
      (e) =>
        e.getFirstPropertyValue("recurrence-id") &&
        e.getFirstPropertyValue("uid") === sub.getFirstPropertyValue("uid"),
    ))
      event.relateException(new ICAL.Event(exception));
    const startZone = String(
      sub.getFirstProperty("dtstart")?.getParameter("tzid") ?? options.timezone,
    );
    const endZone = String(
      sub.getFirstProperty("dtend")?.getParameter("tzid") ?? startZone,
    );
    if (sub.getFirstPropertyValue("status") === "CANCELLED") continue;
    const add = (start: any, end: any) => {
      const startDate = start.toString().slice(0, 10),
        endDate = end.toString().slice(0, 10);
      const begin = start.isDate
        ? wallTime(startDate, options.checkIn, options.timezone)
        : start.zone.tzid === "floating"
          ? wallTime(startDate, start.toString().slice(11, 16), startZone)
          : start.toJSDate().toISOString();
      const finish = end.isDate
        ? wallTime(endDate, options.checkOut, options.timezone)
        : end.zone.tzid === "floating"
          ? wallTime(endDate, end.toString().slice(11, 16), endZone)
          : end.toJSDate().toISOString();
      if (
        finish <= begin ||
        Date.parse(finish) < from.getTime() ||
        Date.parse(begin) > from.getTime() + 366 * 86400000
      )
        return;
      drafts.push({
        propertyId: options.propertyId,
        label: event.summary || "",
        grants: [
          {
            doorId: options.doorId,
            start: begin,
            end: finish,
            singleUse: options.singleUse,
          },
        ],
        breakfast: null,
        notes: "Imported calendar draft — review dates and guest details",
      });
    };
    if (event.isRecurring()) {
      const iterator = event.iterator();
      for (let n = 0; n < 10000 && drafts.length < max; n++) {
        const occurrence = iterator.next();
        if (
          !occurrence ||
          occurrence.toJSDate().getTime() > from.getTime() + 366 * 86400000
        )
          break;
        const detail = event.getOccurrenceDetails(occurrence);
        add(detail.startDate, detail.endDate);
      }
    } else add(event.startDate, event.endDate);
    if (drafts.length >= max) break;
  }
  return drafts;
}
export const extractedDraft = z.object({
  label: z.string().default(""),
  start: z.string().optional(),
  end: z.string().optional(),
  doors: z.array(z.string()).default([]),
  breakfastTotal: z.number().int().nonnegative().optional(),
});
export function parseExtraction(text: string) {
  return extractedDraft.parse(
    JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")),
  );
}
export async function resizeImage(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw Error("Choose a JPEG, PNG or WebP image");
  const image = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
  canvas.width = image.width * scale;
  canvas.height = image.height * scale;
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
}
