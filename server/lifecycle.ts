import type { DB } from "./db";

// One process shares this guard across API requests and the notification worker.
// A reset never overlaps external operations that could later write stale data.
const states = new WeakMap<DB, { active: number; resetting: boolean }>();
export function databaseLifecycle(db: DB) {
  let state = states.get(db);
  if (!state) {
    state = { active: 0, resetting: false };
    states.set(db, state);
  }
  return state;
}
