export type NotificationIcon = "key" | "door" | "danger" | "coffee" | "bell";
export type NotificationPresentation = {
  icon: NotificationIcon;
  href: string | null;
  thumbnail: string | null;
};
export function notificationIcon(type: string): NotificationIcon {
  if (/\.(failed|denied|invalid|uncertain)$/.test(type)) return "danger";
  if (type.startsWith("code.")) return "key";
  if (type.startsWith("breakfast.")) return "coffee";
  if (
    type.startsWith("access.") ||
    type.startsWith("device.") ||
    type.startsWith("door.")
  )
    return "door";
  return "bell";
}
// Build-owned artwork for native notifications; no user content is embedded.
export function notificationIconURL(icon: NotificationIcon) {
  const shapes: Record<NotificationIcon, string> = {
    key: '<circle cx="16" cy="7" r="5"/><path d="m12 11-10 10m2-2 3 3m0-6 3 3"/>',
    danger: '<path d="M12 3 1 21h22L12 3Zm0 6v5m0 3v.1"/>',
    door: '<path d="M3 21h18M6 21V3h12v18m-3-8v.1"/>',
    coffee:
      '<path d="M3 8h13v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Zm13 1h2a3 3 0 0 1 0 6h-2M6 2v3m4-3v3m4-3v3"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  };
  return (
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="white"/><g transform="translate(4 4)" fill="none" stroke="${icon === "danger" ? "#dc2626" : "#171717"}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${shapes[icon]}</g></svg>`,
    )
  );
}
