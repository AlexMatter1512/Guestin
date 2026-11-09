import { describe, expect, test } from "bun:test";
import { guestToken, randomUUID } from "../shared/browser";

describe("browser capability fallbacks", () => {
  test("UUID fallback is secure and formats RFC 4122 version and variant bits", () => {
    let calls = 0;
    const source = {
      getRandomValues<T extends ArrayBufferView | null>(array: T): T {
        calls++;
        (array as unknown as Uint8Array).fill(255);
        return array;
      },
    };
    expect(randomUUID(source)).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    expect(calls).toBe(1);
    expect(() => randomUUID({} as Crypto)).toThrow("Secure random generation");
  });
  test("guest code is recovered from link fragment and excludes language metadata", () => {
    expect(
      guestToken("https://example.com/guest/#code=guest_token&lang=it"),
    ).toBe("guest_token");
    expect(() => guestToken("https://example.com/guest/")).toThrow(
      "no access code",
    );
  });
});
