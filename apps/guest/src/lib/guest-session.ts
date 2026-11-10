// The URL is the only credential store. Never recover a token from browser storage.
export function guestTokenFromURL(href: string) {
  return new URLSearchParams(new URL(href).hash.slice(1)).get("code") ?? "";
}
export function guestURL(href: string, page: string, language: string) {
  const url = new URL(href);
  const fragment = new URLSearchParams();
  const token = guestTokenFromURL(href);
  if (token) fragment.set("code", token);
  if (page === "breakfast") fragment.set("page", "breakfast");
  url.searchParams.set("lang", language);
  url.hash = fragment.toString();
  return url.pathname + url.search + url.hash;
}
export function previousVisit(storage: Pick<Storage, "getItem">) {
  try {
    const saved = JSON.parse(storage.getItem("guestin.guest.visit") ?? "null");
    if (
      typeof saved?.label !== "string" ||
      !saved.label.trim() ||
      saved.label.length > 120 ||
      typeof saved?.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T/.test(saved.date) ||
      !Number.isFinite(Date.parse(saved.date))
    )
      return undefined;
    return { label: saved.label, date: saved.date };
  } catch {
    return undefined;
  }
}
