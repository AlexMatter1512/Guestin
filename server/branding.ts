import { existsSync } from "node:fs";
// Old installation identifiers remain accepted during the Guestin rename.
export function databasePath(
  env: Record<string, string | undefined> = process.env,
) {
  return (
    env.DB_PATH ||
    (!existsSync("data/guestin.sqlite") && existsSync("data/oshost.sqlite")
      ? "data/oshost.sqlite"
      : "data/guestin.sqlite")
  );
}
export function sessionCookie(cookie = "") {
  return (
    cookie.match(/(?:^|;\s*)guestin_session=([^;]+)/)?.[1] ??
    cookie.match(/(?:^|;\s*)oshost_session=([^;]+)/)?.[1]
  );
}
