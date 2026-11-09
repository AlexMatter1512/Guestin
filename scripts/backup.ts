import { Database } from "bun:sqlite";
import {
  mkdirSync,
  copyFileSync,
  chmodSync,
  existsSync,
  cpSync,
} from "node:fs";
import { resolve } from "node:path";
import { initializeRuntimeSecrets } from "../server/runtime-secrets";
const { secrets, path: secretsPath } = initializeRuntimeSecrets();
const destination = resolve(
  process.argv[2] ??
    "backups/" + new Date().toISOString().replace(/[:.]/g, "-"),
);
mkdirSync(destination, { recursive: true, mode: 0o700 });
const db = new Database(process.env.DB_PATH ?? "data/oshost.sqlite");
db.query("VACUUM INTO ?").run(destination + "/oshost.sqlite");
db.close();
if (existsSync("data/assets"))
  cpSync("data/assets", destination + "/assets", { recursive: true });
copyFileSync(secretsPath, destination + "/runtime-secrets.json");
chmodSync(destination + "/runtime-secrets.json", 0o600);
await Bun.write(
  destination + "/secrets.json",
  JSON.stringify({
    APP_KEY: secrets.APP_KEY,
    VAPID_PUBLIC_KEY: secrets.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: secrets.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT,
  }),
);
chmodSync(destination + "/secrets.json", 0o600);
console.log(
  "Backup created at " +
    destination +
    "; store it securely because it includes encryption keys.",
);
