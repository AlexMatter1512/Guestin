import { webhookRequest } from "../shared/webhook";
import { log } from "./log";
import type { DeviceResult } from "../shared/schema";
export type DeviceAdapter = (
  kind: string,
  config: Record<string, string>,
) => Promise<DeviceResult>;
export const openDevice: DeviceAdapter = async (kind, config) => {
  const started = performance.now();
  log("info", "device.request_started", { provider: kind });
  if (kind !== "webhook")
    return {
      status: "failed",
      detail: "This door has no device connector yet",
    };
  try {
    let request;
    try {
      request = webhookRequest(config);
    } catch {
      return { status: "failed", detail: "Invalid webhook configuration" };
    }
    const { url, ...init } = request;
    const r = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
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
    // HTTP mode accepts a successful response without interpreting provider JSON.
    if (config.response_mode !== "ewelink")
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
