import { Database } from "bun:sqlite";
import {
  mkdirSync,
  copyFileSync,
  chmodSync,
  existsSync,
  cpSync,
} from "node:fs";
import { resolve } from "node:path";
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
if (!process.env.APP_KEY)
  throw Error("APP_KEY is required to create a recoverable backup");
await Bun.write(
  destination + "/secrets.json",
  JSON.stringify({
    APP_KEY: process.env.APP_KEY,
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT,
  }),
);
chmodSync(destination + "/secrets.json", 0o600);
console.log(
  "Backup created at " +
    destination +
    "; store it securely because it includes encryption keys.",
);
