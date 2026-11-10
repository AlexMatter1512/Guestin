import { demoWorkspace, seedDemoWorkspace } from "./demo-workspace";
export function appendDemoNotification(
  propertyId: string,
  random = Math.random,
  now = Date.now(),
) {
  const state = demoWorkspace(seedDemoWorkspace())!;
  const records = state.codes.filter(
    (c) => c.propertyId === propertyId && !c.revoked,
  );
  if (!records.length) return null;
  const code = records[Math.floor(random() * records.length)];
  const door = state.doors.find(
    (d) => d.propertyId === propertyId && d.enabled,
  );
  const type = ["access.accepted", "code.created", "breakfast.redeemed"][
    Math.floor(random() * 3)
  ];
  const event = {
    id: crypto.randomUUID(),
    propertyId,
    property_id: propertyId,
    codeId: code.id,
    type,
    created: new Date(now).toISOString(),
    read: false,
    readBy: [] as string[],
    message:
      type === "breakfast.redeemed"
        ? "2 breakfasts redeemed."
        : type === "code.created"
          ? `${code.label}: access code created.`
          : `${code.label}: ${door?.name ?? "Entrance"} request accepted.`,
    context: {
      codeLabel: code.label,
      doorName: door?.name,
      actor: "Demo host",
      timezone: "Europe/Rome",
    },
    icon: type === "access.accepted" ? "door" : "key",
    thumbnail: type === "access.accepted" ? door?.photos?.[0]?.url : undefined,
    href: `/demo/host/#/codes/${code.id}`,
  };
  state.events ??= [];
  state.events.unshift(event);
  state.events.length = Math.min(state.events.length, 50);
  return event;
}
export function demoUnreadCounts() {
  const state = demoWorkspace(seedDemoWorkspace())!;
  const events = (state.events ?? []).filter((e) => !e.read);
  const properties: Record<string, number> = {};
  for (const e of events)
    properties[e.propertyId] = (properties[e.propertyId] ?? 0) + 1;
  return { total: events.length, global: 0, properties };
}
