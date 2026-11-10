import type { DB } from "./db";
import { digest } from "./security";

// Shared by login and password changes, across IPs and process restarts.
// Reserve before awaiting password work so concurrent guesses count too.
export function accountBackoff(db: DB, now = () => Date.now()) {
  return {
    take(email: string) {
      return db.transaction(() => {
        // Do not let random nonexistent emails fill a global lockout budget.
        // Persistent state is bounded by the number of registered accounts.
        if (
          !db
            .query("SELECT 1 FROM users WHERE email=?")
            .get(email.toLowerCase())
        )
          return 0;
        const time = now(),
          key = digest(email.toLowerCase());
        db.query("DELETE FROM account_backoff WHERE expires<=?").run(time);
        const previous = db
          .query("SELECT * FROM account_backoff WHERE identity=?")
          .get(key) as { attempts: number; next: number } | null;
        if (previous && previous.next > time)
          return Math.ceil((previous.next - time) / 1000);
        const attempts = Math.min((previous?.attempts ?? 0) + 1, 10);
        const delay =
          attempts < 5 ? 0 : Math.min(900000, 30000 * 2 ** (attempts - 5));
        db.query(
          "INSERT INTO account_backoff VALUES(?,?,?,?) ON CONFLICT(identity) DO UPDATE SET attempts=excluded.attempts,next=excluded.next,expires=excluded.expires",
        ).run(key, attempts, time + delay, time + 86400000);
        return 0;
      })();
    },
    clear(email: string) {
      db.query("DELETE FROM account_backoff WHERE identity=?").run(
        digest(email.toLowerCase()),
      );
    },
  };
}
