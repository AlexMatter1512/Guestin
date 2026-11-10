export type KeyValuePair = { key: string; value: string };
export const emptyPair = (): KeyValuePair => ({ key: "", value: "" });
export function filledPairs(rows: KeyValuePair[]) {
  for (const row of rows)
    if (!!row.key.trim() !== !!row.value.trim())
      throw Error("Fill in both the key and value, or remove the row");
  return rows
    .filter((row) => row.key.trim() && row.value.trim())
    .map((row) => ({ key: row.key.trim(), value: row.value }));
}
export function headerPairsJSON(rows: KeyValuePair[]) {
  const headers: Record<string, string> = Object.create(null);
  for (const { key, value } of filledPairs(rows)) {
    if (
      Object.keys(headers).some(
        (name) => name.toLowerCase() === key.toLowerCase(),
      )
    )
      throw Error("Duplicate header name");
    headers[key] = value;
  }
  return JSON.stringify(headers);
}
export function splitWebhookURL(value: string) {
  try {
    const parsed = new URL(value),
      query = [...parsed.searchParams].map(([key, value]) => ({ key, value }));
    parsed.search = "";
    return { url: parsed.href, query };
  } catch {
    return { url: value, query: [] as KeyValuePair[] };
  }
}
export function joinWebhookURL(value: string, rows: KeyValuePair[]) {
  const url = new URL(value);
  for (const { key, value } of filledPairs(rows))
    url.searchParams.append(key, value);
  return url.href;
}
