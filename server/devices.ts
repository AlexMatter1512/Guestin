import { log } from "./log";
import type { DeviceResult } from "../shared/schema";
export type DeviceAdapter = (
  kind: string,
  config: Record<string, string>,
) => Promise<DeviceResult>;
export const openDevice: DeviceAdapter = async (kind, config) => {
  const started = performance.now();
  log("info", "device.request_started", { provider: kind });
  if (kind !== "ewelink" && kind !== "shelly")
    return {
      status: "failed",
      detail: "This door has no device connector yet",
    };
  try {
    let url: string,
      init: RequestInit = {
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      };
    if (kind === "ewelink") {
      url =
        "https://eu-apia.coolkit.cc/v2/smartscene2/webhooks/execute?id=" +
        encodeURIComponent(config.webhook_code);
    } else {
      if (!/^shelly-[a-z0-9-]+\.shelly\.cloud$/.test(config.host))
        return { status: "failed", detail: "Invalid Shelly Cloud host" };
      url = `https://${config.host}/v2/devices/api/set/switch?auth_key=${encodeURIComponent(config.api_key)}`;
      init = {
        ...init,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: config.device_id,
          on: true,
        }),
      };
    }
    const r = await fetch(url, init);
    log(r.ok ? "info" : "warn", "device.provider_response", {
      provider: kind,
      providerStatus: r.status,
      durationMs: Math.round(performance.now() - started),
    });
    if (!r.ok)
      return {
        status: r.status >= 500 ? "uncertain" : "failed",
        detail: "Provider rejected the request",
      };
    // Shelly v2 documents HTTP 200 itself as the acceptance signal.
    if (kind === "shelly")
      return {
        status: "accepted",
        detail:
          "Provider accepted the unlock request; physical state is not confirmed",
      };
    const body = await r.text();
    let data: any;
    try {
      data = JSON.parse(body);
    } catch {
      return { status: "uncertain", detail: "Unrecognized provider response" };
    }
    if (
      data.error ||
      data.isok === false ||
      (data.code !== undefined && data.code !== 0)
    )
      return { status: "failed", detail: "Provider reported a failure" };
    if (!(data.error === 0 || data.code === 0))
      return {
        status: "uncertain",
        detail: "Provider response did not confirm acceptance",
      };
    return {
      status: "accepted",
      detail:
        "Provider accepted the unlock request; physical state is not confirmed",
    };
  } catch {
    log("warn", "device.response_uncertain", {
      provider: kind,
      durationMs: Math.round(performance.now() - started),
    });
    return {
      status: "uncertain",
      detail: "No conclusive provider response. Do not retry until checked.",
    };
  }
};
