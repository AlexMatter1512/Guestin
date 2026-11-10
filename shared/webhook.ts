// Credentials remain string-valued for encrypted door configs and portable backups.
export const webhookMethods = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;
export function legacyWebhook(
  config: Record<string, string>,
): Record<string, string> {
  return {
    url:
      "https://eu-apia.coolkit.cc/v2/smartscene2/webhooks/execute?id=" +
      encodeURIComponent(config.webhook_code),
    method: "GET",
    response_mode: "ewelink",
  };
}
export function shellyWebhook(
  config: Record<string, string>,
): Record<string, string> {
  if (
    !/^shelly-[a-z0-9-]+\.shelly\.cloud$/.test(config.host) ||
    !config.device_id ||
    !config.api_key
  )
    throw new Error("Shelly cloud host, device ID and API key required");
  return {
    url: `https://${config.host}/v2/devices/api/set/switch?auth_key=${encodeURIComponent(config.api_key)}`,
    method: "POST",
    headers: JSON.stringify({ "Content-Type": "application/json" }),
    body: JSON.stringify({ id: config.device_id, on: true }),
    response_mode: "http",
  };
}
// Compatibility is confined to input conversion; persisted integrations are webhooks.
export function normalizeDoorInput(input: any) {
  if (input?.integration !== "ewelink" && input?.integration !== "shelly")
    return input;
  if (input.integration === "ewelink" && !input.config?.webhook_code)
    throw new Error("Webhook code required");
  return {
    ...input,
    integration: "webhook",
    config:
      input.integration === "ewelink"
        ? legacyWebhook(input.config)
        : shellyWebhook(input.config ?? {}),
  };
}
export function webhookPreset(preset: string): Record<string, string> {
  if (preset === "ewelink")
    return legacyWebhook({ webhook_code: "YOUR_WEBHOOK_CODE" });
  if (preset === "shelly")
    return shellyWebhook({
      host: "shelly-196-eu.shelly.cloud",
      device_id: "YOUR_DEVICE_ID",
      api_key: "YOUR_API_KEY",
    });
  return {
    url: "",
    method: "GET",
    headers: "",
    body: "",
    response_mode: "http",
  };
}
export function webhookRequest(config: Record<string, string>) {
  const invalid = () => {
    throw new Error("Invalid webhook configuration");
  };
  let url: URL;
  try {
    url = new URL(config.url);
  } catch {
    return invalid();
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash
  )
    invalid();
  const method = config.method || "GET";
  if (!webhookMethods.includes(method as (typeof webhookMethods)[number]))
    invalid();
  if (config.body && ["GET", "HEAD"].includes(method)) invalid();
  if (
    config.response_mode &&
    !["http", "ewelink"].includes(config.response_mode)
  )
    invalid();
  let values: unknown;
  try {
    values = JSON.parse(config.headers || "{}");
  } catch {
    return invalid();
  }
  if (!values || typeof values !== "object" || Array.isArray(values)) invalid();
  const headers = new Headers();
  try {
    for (const [name, value] of Object.entries(
      values as Record<string, unknown>,
    )) {
      if (typeof value !== "string" || /[\r\n]/.test(value)) invalid();
      headers.append(name, value as string);
    }
  } catch {
    return invalid();
  }
  return {
    url: url.href,
    method,
    headers,
    ...(config.body ? { body: config.body } : {}),
  };
}
