import { expect, test } from "bun:test";
import { krossReservationDraft } from "../shared/connectors";

const detail = {
  label: "Planner guest",
  arrival: "2026-11-17",
  departure: "2026-11-20",
  rooms: [{ number: "Camera Edera" }],
};
const options = {
  propertyId: "hotel",
  timezone: "Europe/Rome",
  checkIn: "15:00",
  checkOut: "11:00",
  doors: [
    { propertyId: "hotel", name: "Entrance", id: "front", common: true },
    { propertyId: "hotel", name: "Room Édera", id: "ivy", singleUse: true },
    { propertyId: "hotel", name: "Édera", id: "retired", enabled: false },
    { propertyId: "annex", name: "Camera Edera", id: "other-hotel" },
  ],
};

test("planner proposes the source room’s door and the property's shared entrance", () => {
  const draft = krossReservationDraft(detail, {
    ...options,
  });
  expect(draft.grants?.map((grant) => grant.doorId)).toEqual(["front", "ivy"]);
  expect(draft.grants?.[1].singleUse).toBe(true);
});

test("planner leaves ambiguous or partial door matches for manual review", () => {
  const doors = [
    ...options.doors,
    { propertyId: "hotel", name: "Edera", id: "ivy-annex" },
    { propertyId: "hotel", name: "Room 101", id: "room101" },
  ];
  for (const roomNames of [["Camera Edera"], ["10"], []]) {
    const draft = krossReservationDraft(
      { ...detail, rooms: roomNames },
      { ...options, doors },
    );
    expect(draft.grants?.map((grant) => grant.doorId)).toEqual(["front"]);
  }
});
