import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import webpush from "web-push";
if (existsSync(".env"))
  throw Error(".env already exists; refusing to replace secrets");
const keys = webpush.generateVAPIDKeys();
await Bun.write(
  ".env",
  `APP_KEY=${randomBytes(32).toString("hex")}\nSETUP_TOKEN=${randomBytes(32).toString("base64url")}\nORIGIN=http://localhost:3000\nDB_PATH=data/guestin.sqlite\nVAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nVAPID_SUBJECT=mailto:admin@example.com\n`,
);
const { chmodSync } = await import("node:fs");
chmodSync(".env", 0o600);
console.log("Created .env. Set ORIGIN and VAPID_SUBJECT before deployment.");
