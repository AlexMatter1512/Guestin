import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
export const token = () => randomBytes(32).toString("base64url");
export const digest = (v: string) =>
  createHash("sha256").update(v).digest("hex");
export function vault(key: string) {
  if (!/^[a-fA-F0-9]{64}$/.test(key))
    throw Error("APP_KEY must be 32 random bytes encoded as 64 hex characters");
  const k = Buffer.from(key, "hex");
  return {
    seal(value: unknown) {
      const iv = randomBytes(12),
        c = createCipheriv("aes-256-gcm", k, iv);
      return (() => {
        const bytes = Buffer.concat([
          c.update(JSON.stringify(value)),
          c.final(),
        ]);
        return Buffer.concat([iv, c.getAuthTag(), bytes]).toString("base64");
      })();
    },
    open(value: string) {
      const b = Buffer.from(value, "base64"),
        c = createDecipheriv("aes-256-gcm", k, b.subarray(0, 12));
      c.setAuthTag(b.subarray(12, 28));
      return JSON.parse(
        Buffer.concat([c.update(b.subarray(28)), c.final()]).toString(),
      );
    },
  };
}
