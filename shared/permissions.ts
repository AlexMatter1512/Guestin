import { z } from "zod";

export const collaboratorPermissionsSchema = z
  .object({
    createAccessCodes: z.boolean().default(false),
    createDoors: z.boolean().default(false),
    useBookingConnectors: z.boolean().default(false),
    createStaffCodes: z.boolean().default(false),
  })
  .strict();
// Patch fields must have no defaults: absent fields preserve stored grants.
export const collaboratorPermissionChangesSchema = z
  .object({
    createAccessCodes: z.boolean().optional(),
    createDoors: z.boolean().optional(),
    useBookingConnectors: z.boolean().optional(),
    createStaffCodes: z.boolean().optional(),
  })
  .strict();
export type CollaboratorPermissions = z.infer<
  typeof collaboratorPermissionsSchema
>;
export type Permission = keyof CollaboratorPermissions;
export const permissionLabels: Record<Permission, string> = {
  createAccessCodes: "Create access codes",
  createDoors: "Create new doors",
  useBookingConnectors: "Use booking connectors",
  createStaffCodes: "Create staff access codes",
};
export function hasPermission(
  user:
    | { role?: string; permissions?: Partial<CollaboratorPermissions> }
    | null
    | undefined,
  permission: Permission,
) {
  return user?.role === "owner" || user?.permissions?.[permission] === true;
}
