import { databasePath } from "./branding";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { createECDH, randomBytes } from "node:crypto";
import webpush from "web-push";
import { z } from "zod";

const schema = z.object({
  version: z.literal(1),
  APP_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
  SETUP_TOKEN: z.string().min(1),
  VAPID_PUBLIC_KEY: z.string().regex(/^[A-Za-z0-9_-]{87}$/),
  VAPID_PRIVATE_KEY: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
type Secrets = z.infer<typeof schema>;
type Environment = Record<string, string | undefined>;
const names = [
  "APP_KEY",
  "SETUP_TOKEN",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
] as const;

function validate(value: unknown): Secrets {
  try {
    const secrets = schema.parse(value);
    const curve = createECDH("prime256v1");
    curve.setPrivateKey(Buffer.from(secrets.VAPID_PRIVATE_KEY, "base64url"));
    if (curve.getPublicKey().toString("base64url") !== secrets.VAPID_PUBLIC_KEY)
      throw Error();
    return secrets;
  } catch {
    throw Error(
      "Invalid runtime secrets; restore the original runtime-secrets.json or correct the legacy environment keys. No keys were replaced.",
    );
  }
}

// Keep these beside SQLite so container replacement preserves the encryption identity.
export function initializeRuntimeSecrets(env: Environment = process.env) {
  const dbPath = databasePath(env);
  const path = join(dirname(dbPath), "runtime-secrets.json");
  let secrets: Secrets;
  if (existsSync(path)) {
    let value: unknown;
    try {
      value = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      throw Error(
        "Cannot read runtime-secrets.json; restore it from backup. No keys were replaced.",
      );
    }
    secrets = validate(value);
  } else {
    if (existsSync(dbPath) && statSync(dbPath).size > 0 && !env.APP_KEY)
      throw Error(
        "Existing database has no encryption key. Restore runtime-secrets.json or supply the original APP_KEY before starting.",
      );
    if (!!env.VAPID_PUBLIC_KEY !== !!env.VAPID_PRIVATE_KEY)
      throw Error("Both legacy VAPID keys must be supplied together.");
    const vapid = env.VAPID_PUBLIC_KEY
      ? { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY! }
      : webpush.generateVAPIDKeys();
    secrets = validate({
      version: 1,
      APP_KEY: env.APP_KEY || randomBytes(32).toString("hex"),
      SETUP_TOKEN: env.SETUP_TOKEN || randomBytes(32).toString("base64url"),
      VAPID_PUBLIC_KEY: vapid.publicKey,
      VAPID_PRIVATE_KEY: vapid.privateKey,
    });
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    // Never overwrite a saved identity, including when a second process races startup.
    const file = openSync(path, "wx", 0o600);
    try {
      writeFileSync(file, JSON.stringify(secrets, null, 2) + "\n");
      fsyncSync(file);
    } finally {
      closeSync(file);
    }
  }
  for (const name of names) {
    if (env[name] && env[name] !== secrets[name])
      throw Error(
        `${name} differs from the persisted runtime secrets; restore the original configuration instead of rotating keys at startup.`,
      );
  }
  chmodSync(path, 0o600);
  for (const name of names) env[name] = secrets[name];
  return { secrets, path };
}

export function printSetupInstructions(
  db: { query: (sql: string) => { get: () => unknown } },
  setupToken: string,
) {
  if (db.query("SELECT 1 FROM users LIMIT 1").get()) return;
  // Explicit first-owner bootstrap output, deliberately outside the diagnostic file logger.
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      event: "setup.required",
      message:
        "Open /host/ and use this setup token to create the first owner.",
      setupToken,
    }),
  );
}
