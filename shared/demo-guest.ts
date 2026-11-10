import { demoWorkspace, seedDemoWorkspace } from "./demo-workspace";
const day = () => new Date().toISOString().slice(0, 10);
export async function demoGuestRequest(
  path = "",
  body?: any,
  token = "demo-token-demo-0-0",
): Promise<any> {
  const state = demoWorkspace(seedDemoWorkspace())!;
  const code = state.codes.find((c) => c.token === token);
  if (!code || code.revoked)
    throw Object.assign(Error("This access code is invalid or revoked."), {
      status: 401,
    });
  const property = state.properties.find((p) => p.id === code.propertyId);
  if (!property?.active)
    throw Object.assign(Error("Property unavailable"), { status: 403 });
  const doors = code.grants
    .filter((g: any) => g.active !== false)
    .flatMap((g: any) => {
      const door = state.doors.find((d) => d.id === g.doorId && d.enabled);
      return door
        ? [
            {
              ...door,
              ...g,
              id: door.id,
              timeUnrestricted: !!code.staff,
              used: !!g.used,
            },
          ]
        : [];
    });
  if (path.includes("/open")) {
    const id = path.split("/")[2];
    const door = doors.find((d: any) => d.id === id);
    if (
      !door ||
      (!code.staff &&
        (Date.parse(door.start) > Date.now() ||
          Date.parse(door.end) <= Date.now())) ||
      (door.singleUse && door.used)
    )
      throw Object.assign(Error("Access unavailable"), { status: 403 });
    const grant = code.grants.find((g: any) => g.doorId === id);
    grant.used = (grant.used ?? 0) + 1;
    return { status: "accepted", detail: "Simulated opening request accepted" };
  }
  if (path === "/breakfast") {
    const remaining = Math.max(
      0,
      (code.breakfast?.total ?? 0) - (code.breakfastUsed ?? 0),
    );
    const quantity = body?.quantity;
    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > remaining ||
      day() < code.breakfast.start ||
      day() > code.breakfast.end
    )
      throw Object.assign(Error("Breakfast unavailable"), { status: 403 });
    code.breakfastUsed = (code.breakfastUsed ?? 0) + quantity;
    state.redemptions.push({
      propertyId: code.propertyId,
      codeId: code.id,
      quantity,
      date: day(),
    });
    return { remaining: remaining - quantity };
  }
  return structuredClone({
    codeId: code.id,
    label: code.label,
    property: property.name,
    propertyName: property.name,
    timezone: property.timezone,
    dateFormat: "dd/mm/yyyy",
    staff: code.staff,
    breakfast: code.breakfast,
    breakfastUsed: code.breakfastUsed ?? 0,
    checkinLink: code.checkinLink,
    instructionsLink: code.instructionsLink,
    doors,
  });
}
export function demoCafeTotals(
  from?: string,
  to?: string,
  propertyId = "demo-0",
) {
  const state = demoWorkspace(seedDemoWorkspace())!;
  const redeemed = state.redemptions.filter((r) => r.propertyId === propertyId);
  const sum = (entries: typeof redeemed) =>
    entries.reduce((n, r) => n + r.quantity, 0);
  const today = sum(redeemed.filter((r) => r.date === day()));
  return {
    property:
      state.properties.find((p) => p.id === propertyId)?.name ??
      "Sample property",
    timezone: "Europe/Rome",
    date: day(),
    today: 12 + today,
    thisMonth: 86 + sum(redeemed),
    lastMonth: 126,
    total: from
      ? sum(redeemed.filter((r) => r.date >= from && r.date <= (to ?? day())))
      : 86 + sum(redeemed),
    dateFormat: "dd/mm/yyyy",
    from: from ?? day().slice(0, 8) + "01",
    to: to ?? day(),
  };
}
