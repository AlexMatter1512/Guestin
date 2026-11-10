import { test, expect } from "bun:test";
import { createApp } from "../server/app";
import { openDatabase } from "../server/db";
import { digest } from "../server/security";
import { realtime, websocket } from "../server/realtime";
import { notificationText } from "../shared/notifications";

test("authenticated sockets receive committed code changes and stop receiving after logout", async () => {
  const db = openDatabase(":memory:");
  const origin = "http://host.example";
  const app = createApp(db, {
    key: "a".repeat(64),
    origin,
    setupToken: "setup",
  });
  db.query("INSERT INTO users VALUES(?,?,?,?,?)").run(
    "u",
    "Alex",
    "a@example.com",
    "unused",
    "owner",
  );
  db.query("INSERT INTO sessions VALUES(?,?,?,?)").run(
    digest("session"),
    "u",
    "csrf",
    Date.now() + 60000,
  );
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    websocket,
    fetch: (request, server) => app.fetch(request, { server }),
  });
  const headers = {
    Origin: origin,
    Cookie: "guestin_session=session",
    "X-CSRF-Token": "csrf",
    "Content-Type": "application/json",
  };
  const sockets: WebSocket[] = [];
  const connect = () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/api/v1/live`, {
      headers,
    } as any);
    sockets.push(ws);
    const messages: any[] = [];
    ws.onmessage = ({ data }) => messages.push(JSON.parse(String(data)));
    return { ws, messages };
  };
  async function waitFor(check: () => boolean) {
    for (let i = 0; i < 100 && !check(); i++) await Bun.sleep(10);
    expect(check()).toBe(true);
  }
  async function post(path: string, body: unknown) {
    const response = await app.request(`/api/v1/${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    expect(response.ok).toBe(true);
    return (await response.json()) as any;
  }
  try {
    const url = `http://127.0.0.1:${server.port}/api/v1/live`;
    expect((await fetch(url, { headers: { Origin: origin } })).status).toBe(
      401,
    );
    expect(
      (
        await fetch(url, {
          headers: { ...headers, Origin: "http://evil.example" },
        })
      ).status,
    ).toBe(403);
    const first = connect(),
      second = connect();
    await waitFor(
      () =>
        first.messages[0]?.type === "sync" &&
        second.messages[0]?.type === "sync",
    );
    const property = await post("properties", {
      name: "Casa",
      timezone: "Europe/Rome",
    });
    const door = await post("doors", {
      propertyId: property.id,
      name: "Entrance",
      integration: "none",
      config: {},
    });
    const code = await post("codes", {
      propertyId: property.id,
      label: "Suite Aurora",
      grants: [
        {
          doorId: door.id,
          start: "2026-11-10T12:00:00Z",
          end: "2026-11-12T10:00:00Z",
          singleUse: false,
        },
      ],
    });
    await waitFor(() =>
      second.messages.some((m) => m.event?.type === "code.created"),
    );
    const event = second.messages.find(
      (m) => m.event?.type === "code.created",
    ).event;
    expect(first.messages.some((m) => m.event?.id === event.id)).toBe(true);
    expect(event.context).toMatchObject({
      actor: "Alex",
      codeLabel: "Suite Aurora",
      validFrom: "2026-11-10T12:00:00.000Z",
      validTo: "2026-11-12T10:00:00.000Z",
      timezone: "Europe/Rome",
    });
    expect(notificationText(event).body).toContain(
      "Alex created access code Suite Aurora valid from",
    );
    expect(notificationText(event, "it").body).toContain(
      "Alex ha creato il codice di accesso Suite Aurora valido dal",
    );
    expect(JSON.stringify(event)).not.toContain(code.link);
    expect(
      db.query("SELECT id FROM events WHERE id=?").get(event.id),
    ).toBeTruthy();
    await post(`codes/${code.id}/regenerate`, {});
    await waitFor(() =>
      second.messages.some((m) => m.event?.message === "Guest link replaced"),
    );
    first.ws.close();
    const reconnected = connect();
    await waitFor(() => reconnected.messages[0]?.type === "sync");
    await post(`codes/${code.id}/revoke`, {});
    await waitFor(() =>
      reconnected.messages.some((m) => m.event?.type === "code.revoked"),
    );
    let closed = false;
    reconnected.ws.onclose = (event) => {
      closed = event.code === 1008;
    };
    db.query("DELETE FROM sessions").run();
    realtime(db).heartbeat();
    await waitFor(() => closed);
  } finally {
    for (const ws of sockets) ws.close();
    server.stop(true);
    db.close();
  }
}, 10000);
