import { createBunWebSocket } from "hono/bun";
import type { WSContext } from "hono/ws";
import type { DB } from "./db";

export const { upgradeWebSocket, websocket } = createBunWebSocket();

// One hub per database: tests and separate workspaces never share activity.
const hubs = new WeakMap<DB, ReturnType<typeof createHub>>();
export function realtime(db: DB) {
  let hub = hubs.get(db);
  if (!hub) hubs.set(db, (hub = createHub(db)));
  return hub;
}
function createHub(db: DB) {
  const clients = new Map<WSContext, string>();
  function authorized(session: string) {
    return !!db
      .query("SELECT digest FROM sessions WHERE digest=? AND expires>?")
      .get(session, Date.now());
  }
  function send(ws: WSContext, session: string, message: unknown) {
    if (!authorized(session)) {
      clients.delete(ws);
      ws.close(1008, "Session expired");
      return;
    }
    try {
      ws.send(JSON.stringify(message));
    } catch {
      clients.delete(ws);
      ws.close();
    }
  }
  return {
    connect(ws: WSContext, session: string) {
      clients.set(ws, session);
      send(ws, session, { type: "sync" });
    },
    disconnect(ws: WSContext) {
      // Hono supplies a new wrapper for each socket lifecycle event.
      for (const client of clients.keys())
        if (client.raw === ws.raw) clients.delete(client);
    },
    heartbeat() {
      for (const [ws, session] of clients)
        send(ws, session, { type: "heartbeat" });
    },
    publish(event: unknown) {
      for (const [ws, session] of clients)
        send(ws, session, { type: "activity", event });
    },
  };
}
