import { demoDoorPhotos } from "./demo-door-photos";
// A shared object in the embedding page keeps demo records alive across iframe views.
// No browser storage, server, cookies or production credentials are involved.
export type DemoWorkspace = {
  events?: any[];
  properties: any[];
  doors: any[];
  codes: any[];
  redemptions: {
    propertyId: string;
    codeId: string;
    quantity: number;
    date: string;
  }[];
};
let standalone: DemoWorkspace | undefined;
export function demoWorkspace(seed?: DemoWorkspace): DemoWorkspace | undefined {
  if (typeof window === "undefined") {
    standalone ??= seed;
    return standalone;
  }
  try {
    const owner = window.parent as Window & {
      __guestinDemoWorkspace?: DemoWorkspace;
    };
    owner.__guestinDemoWorkspace ??= seed;
    return owner.__guestinDemoWorkspace;
  } catch {
    standalone ??= seed;
    return standalone;
  }
}
export function demoNavigate(view: "guest" | "cafe", value: string) {
  if (window.parent === window) return false;
  window.parent.postMessage(
    { type: "guestin.demo.navigate", view, value },
    window.location.origin,
  );
  return true;
}
export function seedDemoWorkspace(): DemoWorkspace {
  const at = (days: number) =>
    new Date(Date.now() + days * 86400000).toISOString();
  const properties = ["Villa Olive", "Harbour House"].map((name, i) => ({
    id: `demo-${i}`,
    name,
    timezone: "Europe/Rome",
    checkIn: "15:00",
    checkOut: "11:00",
    active: true,
  }));
  const doors = properties.flatMap((p) =>
    ["Main entrance", "Garden suite"].map((name, i) => ({
      id: `${p.id}-${i}`,
      propertyId: p.id,
      name,
      enabled: true,
      integration: "webhook",
      config: { url: "https://demo.invalid/open", method: "POST" },
      photos: [
        {
          id: `demo-photo-${i}`,
          url: demoDoorPhotos[i],
          alt: i
            ? "Fictional garden suite with a sage green door"
            : "Fictional guesthouse entrance with an oak door",
        },
      ],
      primaryPhotoId: `demo-photo-${i}`,
      translations: {},
      description: i
        ? "The sage green door beside the garden path."
        : "The oak entrance beside the olive tree.",
      order: i,
      common: i === 0,
      singleUse: false,
    })),
  );
  const codes = properties.flatMap((p) =>
    ["Alex Morgan", "Jamie Taylor", "Housekeeping"].map((label, i) => ({
      id: `${p.id}-code-${i}`,
      propertyId: p.id,
      label,
      staff: i === 2,
      notes: "Fictional demo guest",
      token: `demo-token-${p.id}-${i}`,
      revoked: false,
      created: at(-2),
      grants: doors
        .filter((d) => d.propertyId === p.id)
        .map((d) => ({
          doorId: d.id,
          start: at(-1),
          end: at(3),
          singleUse: false,
          active: true,
        })),
      breakfastUsed: 2,
      breakfast: {
        total: 6,
        start: at(-1).slice(0, 10),
        end: at(3).slice(0, 10),
      },
      checkinLink: "",
      instructionsLink: "",
    })),
  );
  return { properties, doors, codes, redemptions: [] };
}
