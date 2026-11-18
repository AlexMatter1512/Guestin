import { test, expect } from "bun:test";
import {
  calendarDrafts,
  wallTime,
  KrossClient,
  parseExtraction,
  krossProperties,
  krossReservations,
  krossReservationDraft,
} from "../shared/connectors";
import { localDate } from "../shared/schema";
import { publicURL } from "../server/connectors";
const options = {
  propertyId: "property",
  doorId: "room",
  timezone: "Europe/Rome",
  checkIn: "15:00",
  checkOut: "11:00",
  singleUse: true,
};
test("calendar all-day exclusive end and recurrence generate drafts only", () => {
  const text =
    "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:one\r\nDTSTART;VALUE=DATE:20261110\r\nDTEND;VALUE=DATE:20261112\r\nSUMMARY:Alex\r\nRRULE:FREQ=WEEKLY;COUNT=2\r\nEND:VEVENT\r\nEND:VCALENDAR";
  const d = calendarDrafts(text, options, new Date("2026-11-09"));
  expect(d).toHaveLength(2);
  expect(d[0].grants![0].start).toBe("2026-11-10T14:00:00.000Z");
  expect(d[0].grants![0].end).toBe("2026-11-12T10:00:00.000Z");
  expect(d[0].breakfast).toBeNull();
  const counted = calendarDrafts(
    text.replace("SUMMARY:Alex", "SUMMARY:Alex\r\nX-GUEST-COUNT:3"),
    options,
    new Date("2026-11-09"),
  );
  expect(counted.map((draft) => draft.breakfast)).toEqual([
    { start: "2026-11-11", end: "2026-11-12", total: 6 },
    { start: "2026-11-18", end: "2026-11-19", total: 6 },
  ]);
});
test("property-local date boundary and DST conversion", () => {
  expect(localDate("Europe/Rome", new Date("2026-11-09T23:30:00Z"))).toBe(
    "2026-11-10",
  );
  expect(wallTime("2026-07-01", "15:00", "Europe/Rome")).toBe(
    "2026-07-01T13:00:00.000Z",
  );
  expect(() => wallTime("2026-03-29", "02:30", "Europe/Rome")).toThrow();
});
test("Kross challenge flow matches the working krossApy default request", async () => {
  const calls: any[] = [];
  const client = new KrossClient(
    async (path, body) => {
      calls.push({ path, body });
      return { "2fa": true, devices: [] };
    },
    "hotel",
    "device",
  );
  await client.login("user", "password");
  await client.requestTwoFactor("user", "password", {
    "2fa_type": "email",
    "2fa_id": "recipient",
    password: "evil",
  });
  await client.login("user", "password", {
    "2fa_type": "email",
    "2fa_code": "1234",
    "2fa_trust": false,
  });
  await client.arrivals(1, "2026-11-09", 2);
  expect(calls[1].body.password).toBe("password");
  expect(client.deviceId).toBe("device");
  expect(calls[0].body).toEqual({
    hotel_id: "hotel",
    username: "user",
    password: "password",
    api_key: "apf6phf4eeb70da55fa972e3b7g403d4",
    with_priv: true,
    app: "krossapp",
    type: "FCM",
  });
  expect(calls[3].path).toEndWith("?page=2");
});
test("malformed and uncertain extraction cannot become active grants", () => {
  expect(() => parseExtraction("not json")).toThrow();
  expect(() => parseExtraction('{"breakfastTotal":-1}')).toThrow();
  expect(parseExtraction("{}")).toEqual({ label: "", doors: [] });
});
test("calendar relay blocks loopback, private networks, userinfo and protocols", async () => {
  for (const url of [
    "http://example.com/calendar",
    "https://127.0.0.1/calendar",
    "https://10.0.0.1/calendar",
    "https://[::1]/calendar",
    "https://user:password@example.com/calendar",
  ])
    expect(publicURL(url)).rejects.toThrow();
});

test("iCal TZID without VTIMEZONE uses its timezone rather than the property timezone", () => {
  const text =
    "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:zone\r\nDTSTART;TZID=America/New_York:20261110T150000\r\nDTEND;TZID=America/New_York:20261110T170000\r\nSUMMARY:Guest\r\nEND:VEVENT\r\nEND:VCALENDAR";
  const draft = calendarDrafts(text, options, new Date("2026-11-09"))[0];
  expect(draft.grants![0].start).toBe("2026-11-10T20:00:00.000Z");
});

// Fixture keys mirror krossApy v5 and BnBScraper/dbWriter.py's current DTOs.
test("Kross v5 property wrappers, search pagination, detail rooms and guest links map to drafts", async () => {
  expect(
    krossProperties({
      data: { properties: [{ id_property: 12, name: "Athena" }] },
    })[0].id_property,
  ).toBe(12);
  expect(
    krossReservations({
      data: [{ id_reservation: 42, label: "Maria" }],
      has_next_page: true,
    }),
  ).toEqual({
    items: [{ id_reservation: 42, label: "Maria" }],
    hasNextPage: true,
  });
  expect(
    krossReservations({ data: [], has_next_page: false }).hasNextPage,
  ).toBe(false);
  expect(() => krossProperties({ data: { unexpected: true } })).toThrow();
  expect(() => krossReservations({ data: { unexpected: true } })).toThrow();
  const options = {
    propertyId: "property",
    timezone: "Europe/Rome",
    checkIn: "15:00",
    checkOut: "11:00",
    doors: [
      { id: "common", propertyId: "property", name: "Entrance", common: true },
      { id: "room", propertyId: "property", name: "101", singleUse: true },
      { id: "disabled", propertyId: "property", name: "101", enabled: false },
      { id: "other", propertyId: "elsewhere", name: "101" },
    ],
  };
  const draft = krossReservationDraft(
    {
      data: {
        reservation: {
          label: "Maria Rossi",
          arrival: "2026-07-01",
          departure: "2026-07-03",
          rooms: [{ number: "101", name_room_type: "Double" }],
          link_guest_portal: "https://example.com/check-in",
          link_check_in_instructions: "https://example.com/arrival",
          n_guests: 3,
        },
      },
    },
    options,
  );
  expect(draft.label).toBe("Maria Rossi");
  expect(draft.grants?.map((g) => g.doorId)).toEqual(["common", "room"]);
  expect(draft.grants?.[0].start).toBe("2026-07-01T13:00:00.000Z");
  expect(draft.grants?.[1].end).toBe("2026-07-03T09:00:00.000Z");
  expect(draft.checkinLink).toBe("https://example.com/check-in");
  expect(draft.instructionsLink).toBe("https://example.com/arrival");
  expect(draft.breakfast).toEqual({
    start: "2026-07-02",
    end: "2026-07-03",
    total: 6,
  });
  const missing = krossReservationDraft(
    { data: { reservation: { label: "Unknown dates" } } },
    options,
  );
  expect(missing.grants).toEqual([]);
  expect(missing.notes).toContain("missing or invalid");
  const summaryFallback = krossReservationDraft(
    { data: { reservation: { link_summary: "https://example.com/summary" } } },
    options,
    {
      label: "Summary name",
      arrival: "01/07/2026",
      departure: "03/07/2026",
      name_room_type: '["101"]',
    },
  );
  expect(summaryFallback.grants?.map((g) => g.doorId)).toEqual([
    "common",
    "room",
  ]);
  expect(summaryFallback.checkinLink).toBe("https://example.com/summary");
});
test("Kross v5 login validates acknowledgement, preserves leading zero verification and sends query", async () => {
  const calls: any[] = [];
  let response: any = {
    "2fa": true,
    devices: [
      { "2fa_type": "email", "2fa_id": 7, "2fa_device": "m***@example.com" },
    ],
  };
  const client = new KrossClient(
    async (path, body) => {
      calls.push({ path, body });
      return response;
    },
    "hotel",
    "stable-device",
  );
  await client.login("user", "password");
  await client.requestTwoFactor("user", "password", response.devices[0]);
  response = { authenticated: true };
  await client.completeTwoFactor(
    "user",
    "password",
    { "2fa_type": "email" },
    "001234",
  );
  expect(calls[2].body["2fa_code"]).toBe("001234");
  expect(calls[2].body["2fa_trust"]).toBe(false);
  expect(client.deviceId).toBe("stable-device");
  for (const call of calls) {
    expect(call.body).not.toHaveProperty("device_id");
    expect(call.body).not.toHaveProperty("deviceName");
    expect(call.body).not.toHaveProperty("deviceSystem");
  }
  await client.search({ id_property: 12, search: "Maria", page: 2 });
  expect(calls[3].body).toEqual({ id_property: 12, query: "Maria", page: 2 });
  response = {};
  expect(client.login("user", "password")).rejects.toThrow("did not confirm");
  response = { error_code: 1, error_message: "Invalid login" };
  expect(client.login("user", "password")).rejects.toThrow("Invalid login");
});

test("Kross planner requests the selected calendar month and keeps each provider room and lane", async () => {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const client = new KrossClient(
    async (path, body) => {
      calls.push({ path, body });
      // Rome goes to summer time on the last weekend of March.
      const start = Date.parse("2026-02-28T23:00:00Z") / 1000;
      const arrival = Date.parse("2026-03-29T22:00:00Z") / 1000;
      return {
        data: {
          start: "2026-03-01",
          start_timestamp: start,
          result: true,
          dates: { [arrival]: { timestamp: arrival, date: "Mar 30" } },
          rooms: [
            {
              id_room: 4,
              label_room: "Amber [001]",
              number: "A1",
              name_room_type: "Room Double",
              room_color: "a2b",
            },
            {
              id_room: 5,
              label_room: "Indigo",
              number: "B1",
              name_room_type: "Camera Double",
            },
          ],
          planner: {
            4: [
              {
                [arrival]: {
                  id_reservation: 37,
                  reservation: "Planner guest",
                  size: 2,
                  bg_color: "#002244",
                  text_color: "#fff",
                },
              },
              {
                [arrival]: {
                  id_room_block: 7,
                  reservation: "Maintenance",
                  size: 1,
                },
              },
            ],
          },
        },
      };
    },
    "hotel",
    "device",
  );
  const plan = await client.planner(12, "2026-03", "it");
  expect(calls[0]).toEqual({
    path: "/app/get-planner?id_property=12&days=31&date_start=2026-03-01",
    body: {
      id_property: 12,
      days: 31,
      date_start: "2026-03-01",
      checkout: false,
      lang: "it",
      groups: [],
    },
  });
  expect(plan.rooms.map(({ id, name }) => [id, name])).toEqual([
    ["4", "Amber [001]"],
    ["5", "Indigo"],
  ]);
  expect(plan.rooms[0].color).toBe("#a2b");
  expect(plan.reservations).toHaveLength(2);
  expect(plan.reservations[0]).toEqual({
    id_reservation: 37,
    roomId: "4",
    roomNames: ["Amber [001]"],
    row: 1,
    label: "Planner guest",
    arrival: "2026-03-30",
    departure: "2026-04-01",
    color: "#002244",
    textColor: "#fff",
  });
  expect(plan.reservations[1]).toMatchObject({
    id_reservation: 0,
    blockId: 7,
    row: 2,
    departure: "2026-03-31",
  });
  await client.planner(12, "2028-02");
  expect(calls[1].body.days).toBe(29);
  await expect(client.planner(0, "2026-03")).rejects.toThrow();
  await expect(client.planner(12, "2026-13")).rejects.toThrow();
  expect(calls).toHaveLength(2);
});

test("Kross planner retains empty rooms and treats the provider's day labels as calendar dates", async () => {
  let response: any = {
    data: { rooms: { 9: { id_room: 9, number: 101 } }, dates: [], planner: [] },
  };
  const client = new KrossClient(async () => response, "hotel", "device");
  expect(await client.planner(1, "2026-12")).toMatchObject({
    rooms: [{ id: "9", name: "101" }],
    reservations: [],
  });
  response.data.dates = [{ timestamp: "1798671600", date: "31/12" }];
  response.data.planner = {
    9: [{ "1798671600": { id_reservation: "22", size: 2 } }],
  };
  expect((await client.planner(1, "2026-12")).reservations[0]).toMatchObject({
    arrival: "2026-12-31",
    departure: "2027-01-02",
  });
  response = { data: { unexpected: true } };
  await expect(client.planner(1, "2026-12")).rejects.toThrow(
    "unreadable planner",
  );
});

test("planner ranges cross provider request boundaries without splitting a stay", async () => {
  const calls: { date_start: string; days: number }[] = [];
  const client = new KrossClient(
    async (_path, body) => {
      const start = String(body.date_start);
      const days = Number(body.days);
      calls.push({ date_start: start, days });
      const timestamp = Date.parse(start) / 1000;
      return {
        data: {
          start,
          start_timestamp: timestamp,
          dates: [{ timestamp }],
          rooms: [{ id_room: 1, number: "A" }],
          planner: { 1: [{ [timestamp]: { id_reservation: 42, size: days } }] },
        },
      };
    },
    "hotel",
    "device",
  );
  const result = await client.plannerRange(1, "2026-12-20", "2027-01-23");
  expect(calls).toEqual([
    { date_start: "2026-12-20", days: 31 },
    { date_start: "2027-01-20", days: 4 },
  ]);
  expect(result.rooms).toHaveLength(1);
  expect(result.reservations).toHaveLength(1);
  expect(result.reservations[0]).toMatchObject({
    arrival: "2026-12-20",
    departure: "2027-01-24",
  });
});
