import type { z } from "zod";
import type { codeInputSchema } from "../shared/schema";
import type { AccessCodeChange } from "../shared/access-code-changes";

export type CodeInput = z.output<typeof codeInputSchema>;
export type CodeRecord = Omit<CodeInput, "grants"> & {
  importedCreatorName?: string;
  importedCreatorId?: string;
};
type Grant = CodeInput["grants"][number] & { active: boolean };

export function accessCodeChanges(
  before: Partial<CodeRecord>,
  after: CodeRecord,
  oldGrants: Map<string, Grant>,
  newGrants: Map<string, Grant>,
  doorName: (id: string) => string,
): AccessCodeChange[] {
  const changes: AccessCodeChange[] = [];
  if (before.label && before.label !== after.label)
    changes.push({ kind: "label", from: before.label, to: after.label });
  if (Boolean(before.staff) !== after.staff)
    changes.push({ kind: "staff", staff: after.staff });

  for (const field of ["notes", "checkinLink", "instructionsLink"] as const)
    if ((before[field] ?? "") !== after[field]) changes.push({ kind: field });

  const from = before.breakfast ?? null;
  const to = after.breakfast;
  if (
    from?.total !== to?.total ||
    from?.start !== to?.start ||
    from?.end !== to?.end
  )
    changes.push({ kind: "breakfast", from, to });

  // The edit form disables deselected doors. The API can also omit them.
  for (const [id, previous] of oldGrants)
    if (previous.active && !newGrants.get(id)?.active)
      changes.push({ kind: "doorRemoved", door: doorName(id) });

  for (const [id, grant] of newGrants) {
    const previous = oldGrants.get(id);
    if (!grant.active) continue;
    if (!previous?.active) {
      changes.push({ kind: "doorAdded", door: doorName(id) });
      continue;
    }
    const startChanged =
      !before.staff &&
      !after.staff &&
      Date.parse(previous.start) !== Date.parse(grant.start);
    const endChanged =
      !before.staff &&
      !after.staff &&
      Date.parse(previous.end) !== Date.parse(grant.end);
    const useChanged = previous.singleUse !== grant.singleUse;
    if (!startChanged && !endChanged && !useChanged) continue;
    const door = doorName(id);
    if (startChanged)
      changes.push({
        kind: "doorStart",
        door,
        from: previous.start,
        to: grant.start,
      });
    if (endChanged)
      changes.push({
        kind: "doorEnd",
        door,
        from: previous.end,
        to: grant.end,
      });
    if (useChanged)
      changes.push({ kind: "singleUse", door, enabled: grant.singleUse });
  }
  return changes;
}
