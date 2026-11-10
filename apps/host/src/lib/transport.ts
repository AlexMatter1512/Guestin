import { demoUnreadCounts } from "../../../../shared/demo-notifications";
import {
  demoWorkspace,
  seedDemoWorkspace,
} from "../../../../shared/demo-workspace";
import { backupSchema } from "../../../../shared/backup";
import {
  propertySchema,
  doorSchema,
  codeSchema,
} from "../../../../shared/schema";
export const demoMode = import.meta.env.MODE === "demo";
export type Transport = (
  path: string,
  body?: any,
  method?: string,
  headers?: Record<string, string>,
) => Promise<any>;
const today = new Date();
const date = (offset: number) =>
  new Date(today.getTime() + offset * 86400000).toISOString();
let { properties, doors, codes } = seedDemoWorkspace();
const user: any = {
  id: "demo-user",
  name: "Alex Morgan",
  email: "host@example.invalid",
  role: "owner",
  emailVerified: true,
  preferences: { language: "en", tour: { status: "skipped" } },
};
const users: any[] = [
  user,
  {
    id: "demo-colleague",
    name: "Jamie Taylor",
    email: "jamie@example.invalid",
    role: "collaborator",
    permissions: {
      createAccessCodes: true,
      createStaffCodes: true,
      createDoors: false,
      useBookingConnectors: true,
    },
  },
];
const connections: any[] = [];
const settings: any = { dateFormat: "dd/mm/yyyy" };
let smtp: any = {
  host: "smtp.example.invalid",
  port: 587,
  security: "starttls",
  username: "host",
  password: "",
  from: "welcome@example.invalid",
  fromName: "Villa Olive",
  hasPassword: true,
};
let templates: any[] = [];
const requestDemo: Transport = async (
  path,
  body,
  method = body === undefined ? "GET" : "POST",
) => {
  const route = path.split("?")[0];
  if (route === "me") return { user: structuredClone(user), csrf: "" };
  if (route === "me/preferences") {
    user.preferences = { ...user.preferences, ...body };
    return structuredClone(user.preferences);
  }
  if (route === "settings") {
    if (body) Object.assign(settings, body);
    return structuredClone(settings);
  }
  if (route === "admin/smtp") {
    if (method === "DELETE") {
      smtp = null;
      return {};
    }
    if (body) smtp = { ...body, password: "", hasPassword: !!body.password };
    return structuredClone(smtp);
  }
  if (route === "mail/status") return { configured: !!smtp };
  if (
    [
      "admin/smtp/test",
      "me/verify-email",
      "me/password",
      "auth/verify-email",
      "auth/reset-password",
      "auth/password-reset-request",
    ].includes(route)
  )
    return { ok: true };
  if (route === "auth/status")
    return { needsSetup: false, smtpConfigured: !!smtp };
  if (route === "users") return structuredClone(users);
  if (route === "invites")
    return { link: location.origin + "/demo/host/#invite=sample" };
  if (route === "push/subscriptions") return [];
  if (route === "admin/wipe") {
    codes = [];
    doors = [];
    properties = [];
    return { ok: true };
  }
  if (route === "admin/export") return exportDemo();
  if (route === "admin/import") {
    const b = backupSchema.parse(body.backup);
    const result = {
      properties: 0,
      doors: 0,
      codes: 0,
      skippedProperties: 0,
      skippedDoors: 0,
      skippedCodes: 0,
    };
    for (const name of ["properties", "doors", "codes"] as const) {
      const records =
        name === "properties" ? properties : name === "doors" ? doors : codes;
      for (const record of b[name]) {
        if (records.some((r: any) => r.id === record.id)) continue;
        records.push({ ...record.data, ...record, id: record.id });
        result[name]++;
      }
    }
    return result;
  }
  if (route.startsWith("admin/records/")) {
    const kind = route.split("/")[2] as "doors" | "codes";
    const b = exportDemo();
    const propertyId =
      new URLSearchParams(path.split("?")[1]).get("propertyId") ??
      body?.propertyId ??
      properties[0]?.id;
    if (route.endsWith("export"))
      return {
        format: "guestin-" + kind,
        version: 1,
        exportedAt: date(0),
        propertyId: exportId(propertyId),
        [kind]: b[kind].filter(
          (r: any) => r.data.propertyId === exportId(propertyId),
        ),
        ...(kind === "doors" ? { doorTests: [] } : { events: [] }),
      };
    const records = kind === "doors" ? doors : codes;
    const incoming = body.data[kind];
    let added = 0,
      skipped = 0;
    for (const r of incoming) {
      if (records.some((x: any) => x.id === r.id)) {
        skipped++;
        continue;
      }
      records.push({ ...r.data, ...r, propertyId: body.propertyId });
      added++;
    }
    return { added, replaced: 0, removed: 0, skipped };
  }
  for (const [name, records] of [
    ["properties", properties],
    ["doors", doors],
    ["connections", connections],
    ["users", users],
  ] as const) {
    if (route === name && method === "GET") return structuredClone(records);
    if (route === name && body) {
      const record = { ...body, id: crypto.randomUUID(), active: true };
      records.push(record);
      return structuredClone(record);
    }
    if (route.startsWith(name + "/")) {
      const [id, action] = route.slice(name.length + 1).split("/");
      if (name === "doors" && ["test", "open", "resolve-test"].includes(action))
        return {
          status: "accepted",
          detail: "Simulated opening",
          attemptId: crypto.randomUUID(),
        };
      if (name === "users" && action === "password-reset-link")
        return { link: location.origin + "/demo/host/#reset=sample" };
      if (name === "doors" && id === "order") {
        body.doorIds.forEach((id: string, i: number) => {
          const d = doors.find((d) => d.id === id);
          if (d) d.order = i;
        });
        return { ok: true };
      }
      const record = records.find((r: any) => r.id === id);
      if (!record) throw Error("Sample record not found");
      if (name === "connections" && action === "request") {
        if (record.kind === "gemini")
          return {
            text: JSON.stringify({
              label: "Alex Morgan",
              start: date(-1),
              end: date(3),
              doors: ["Main entrance", "Garden suite"],
              breakfastTotal: 6,
            }),
          };
        if (record.kind === "ical")
          return {
            text:
              "BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:demo-stay\nDTSTART:" +
              date(0).slice(0, 10).replaceAll("-", "") +
              "\nDTEND:" +
              date(3).slice(0, 10).replaceAll("-", "") +
              "\nSUMMARY:Alex Morgan\nEND:VEVENT\nEND:VCALENDAR",
          };
        return {
          data: {
            token: "sample",
            reservations: [
              {
                id: "sample",
                name: "Alex Morgan",
                arrival: date(0).slice(0, 10),
                departure: date(3).slice(0, 10),
              },
            ],
          },
          token: "sample",
          verified: true,
        };
      }
      if (name === "properties" && action === "notifications") {
        Object.assign(record, {
          notificationRetentionMonths: body.retentionMonths,
          notificationRetentionLimit: body.maxNotifications,
        });
        return structuredClone(record);
      }
      if (name === "properties" && action === "breakfast-settings") {
        record.breakfastProtected = body.enabled;
        return structuredClone(record);
      }
      if (method === "DELETE") records.splice(records.indexOf(record), 1);
      else if (body) Object.assign(record, body);
      return structuredClone(record);
    }
  }
  if (route === "reports")
    return codes.map((c) => ({
      ...c,
      property_id: c.propertyId,
      creator: "demo-user",
      name: "Demo host",
      attempts: 3,
      accepted: 2,
    }));
  if (route === "events/unread") return demoUnreadCounts();
  if (route.startsWith("events")) {
    const state = demoWorkspace(seedDemoWorkspace())!;
    state.events ??= [];
    if (route === "events/read" || route === "events/read-all") {
      for (const event of state.events) {
        if (
          route === "events/read"
            ? body.eventIds.includes(event.id)
            : !body.propertyId || event.propertyId === body.propertyId
        ) {
          event.read = true;
          event.readBy = ["demo-user"];
        }
      }
      return { ok: true };
    }
    const propertyId = new URLSearchParams(path.split("?")[1]).get(
      "propertyId",
    );
    return {
      events: structuredClone(
        state.events.filter((e) => !propertyId || e.propertyId === propertyId),
      ),
      nextCursor: null,
    };
  }
  if (route.startsWith("templates/")) {
    if (body) templates = body;
    return structuredClone(templates);
  }

  if (route === "codes" && method === "GET") return codes.map(exposeCode);
  if (route === "codes") {
    const code = {
      ...body,
      id: crypto.randomUUID(),
      token: "demo-" + crypto.randomUUID(),
      revoked: false,
      created: date(0),
      breakfastUsed: 0,
    };
    codes.push(code);
    return exposeCode(code);
  }
  const match = route.match(
    /^codes\/([^/]+)(?:\/(revoke|regenerate|resolve))?$/,
  );
  if (match) {
    const code = codes.find((c) => c.id === match[1]);
    if (!code) throw Error("Sample code not found");
    if (method === "DELETE") {
      codes = codes.filter((c) => c.id !== match[1]);
      return { ok: true };
    }
    if (match[2] === "revoke") code.revoked = true;
    else if (match[2] === "regenerate")
      code.token = "demo-" + crypto.randomUUID();
    else Object.assign(code, body);
    return exposeCode(code);
  }
  if (route.includes("open"))
    return {
      status: "accepted",
      detail: "Simulated request. No device was contacted.",
    };
  throw Error("This action is unavailable in the interactive demo.");
};

const exportIds = new Map<string, string>();
function exportId(id: string) {
  if (!exportIds.has(id)) exportIds.set(id, crypto.randomUUID());
  return exportIds.get(id)!;
}
function exportDemo() {
  return backupSchema.parse({
    format: "guestin-json",
    version: 1,
    exportedAt: date(0),
    properties: properties.map((p) => ({
      id: exportId(p.id),
      data: propertySchema.parse(p),
    })),
    doors: doors.map((d) => ({
      id: exportId(d.id),
      data: doorSchema.parse({ ...d, propertyId: exportId(d.propertyId) }),
      config: d.config,
    })),
    codes: codes.map((c) => ({
      id: exportId(c.id),
      data: codeSchema
        .omit({ grants: true })
        .parse({ ...c, propertyId: exportId(c.propertyId) }),
      token: (c.token ?? "sample")
        .padEnd(32, "0")
        .replace(/[^A-Za-z0-9_-]/g, "_"),
      revoked: !!c.revoked,
      created: c.created,
      creatorId: null,
      creatorName: "Demo host",
      grants: c.grants.map((g: any) => ({
        ...g,
        doorId: exportId(g.doorId),
        active: true,
        used: 0,
        claim: null,
      })),
      redemptions: [],
      actions: [],
      metrics: { attempts: 3, accepted: 2 },
    })),
    doorTests: [],
    events: [],
  });
}

function exposeCode(code: any) {
  return structuredClone({
    ...code,
    link: `${typeof location === "undefined" ? "http://localhost" : location.origin}/demo/guest/#code=${encodeURIComponent(code.token)}`,
  });
}
export const demoTransport: Transport = async (...args) => {
  const state = demoWorkspace({ properties, doors, codes, redemptions: [] })!;
  properties = state.properties;
  doors = state.doors;
  codes = state.codes;
  try {
    return await requestDemo(...args);
  } finally {
    state.properties = properties;
    state.doors = doors;
    state.codes = codes;
  }
};
