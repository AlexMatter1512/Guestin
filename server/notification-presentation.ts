import type { DB } from "./db";
import {
  notificationIcon,
  type NotificationPresentation,
} from "../shared/notification-presentation";

export function notificationPresentation(
  db: DB,
  event: {
    type: string;
    property_id?: string | null;
    code_id?: string | null;
    context?: { doorId?: string };
  },
): NotificationPresentation {
  const result: NotificationPresentation = {
    icon: notificationIcon(event.type),
    href: null,
    thumbnail: null,
  };
  if (event.type === "account.reset_requested") {
    result.href = "/host/#/settings/team";
    return result;
  }
  if (event.type === "access.invalid") return result;
  if (
    event.type.startsWith("code.") ||
    event.type.startsWith("breakfast.") ||
    event.type === "device.resolved"
  ) {
    if (
      event.code_id &&
      db
        .query("SELECT 1 FROM codes WHERE id=? AND property_id=?")
        .get(event.code_id, event.property_id ?? null)
    )
      result.href = "/host/#/codes/" + encodeURIComponent(event.code_id);
    return result;
  }
  const id = event.context?.doorId;
  const door =
    id &&
    (db
      .query("SELECT id,data FROM doors WHERE id=? AND property_id=?")
      .get(id, event.property_id ?? null) as
      { id: string; data: string } | undefined);
  if (door) {
    result.href = "/host/#/doors/" + encodeURIComponent(door.id);
    const data = JSON.parse(door.data);
    if (event.type === "access.accepted" && data.photos?.length)
      result.thumbnail =
        "/api/v1/doors/" + encodeURIComponent(door.id) + "/thumbnail";
  } else if (
    event.code_id &&
    db
      .query("SELECT 1 FROM codes WHERE id=? AND property_id=?")
      .get(event.code_id, event.property_id ?? null)
  ) {
    result.href = "/host/#/codes/" + encodeURIComponent(event.code_id);
  }
  return result;
}
