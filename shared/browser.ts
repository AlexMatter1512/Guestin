/** Secure UUID generation also works on HTTP LAN origins, where randomUUID is absent. */
export function randomUUID(
  source: Pick<Crypto, "getRandomValues"> &
    Partial<Pick<Crypto, "randomUUID">> = globalThis.crypto,
): string {
  if (typeof source?.randomUUID === "function") return source.randomUUID();
  if (typeof source?.getRandomValues !== "function")
    throw new Error("Secure random generation is unavailable in this browser.");
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The code is the server-issued token, never the internal record ID. */
export function guestToken(link: string): string {
  const url = new URL(link, "http://localhost");
  const code = new URLSearchParams(url.hash.slice(1)).get("code");
  if (!code) throw new Error("This guest link has no access code.");
  return code;
}
