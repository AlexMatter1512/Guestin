import { afterEach, expect, test } from "bun:test";
import { openDevice } from "../server/devices";
import { createApp } from "../server/app";
import { openDatabase } from "../server/db";
import { vault } from "../server/security";
import { exportRecords, restoreRecords } from "../server/portable-backup";
import {
  legacyWebhook,
  shellyWebhook,
  webhookPreset,
  webhookRequest,
} from "../shared/webhook";
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("webhooks send full URLs, methods, headers and raw bodies without retries or redirects", async () => {
  for (const method of [
    "GET",
    "HEAD",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ]) {
    let calls = 0;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls++;
      expect(url).toBe("http://192.168.1.10/unlock?token=secret&channel=2");
      expect(init.method).toBe(method);
      expect(new Headers(init.headers).get("Authorization")).toBe(
        "Bearer secret",
      );
      expect(init.body).toBe(
        ["GET", "HEAD"].includes(method) ? undefined : '{"on":true}',
      );
      expect(init.redirect).toBe("error");
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return new Response(null, { status: 204 });
    }) as any;
    expect(
      (
        await openDevice("webhook", {
          url: "http://192.168.1.10/unlock?token=secret&channel=2",
          method,
          headers:
            '{"Authorization":"Bearer secret","Content-Type":"application/json"}',
          body: ["GET", "HEAD"].includes(method) ? "" : '{"on":true}',
        })
      ).status,
    ).toBe("accepted");
    expect(calls).toBe(1);
  }
});

test("webhook validation rejects invalid settings before sending a request", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response();
  }) as any;
  const invalidConfigs: Record<string, string>[] = [
    { url: "file:///tmp/secret" },
    { url: "bad" },
    { url: "https://user:password@example.com" },
    { url: "https://example.com/#fragment" },
    { method: "TRACE" },
    { method: "GET", body: "bad" },
    { method: "HEAD", body: "bad" },
    { headers: "[]" },
    { headers: "null" },
    { headers: '{"X-Token":42}' },
    { headers: '{"X-Token":"bad\\r\\nheader"}' },
    { headers: '{"bad name":"value"}' },
    { response_mode: "unknown" },
  ];
  for (const config of invalidConfigs) {
    const settings = { url: "https://example.com", ...config };
    expect(() => webhookRequest(settings)).toThrow(
      "Invalid webhook configuration",
    );
    expect((await openDevice("webhook", settings)).status).toBe("failed");
  }
  expect(calls).toBe(0);
});

test("webhook acceptance uses HTTP status or optional eWeLink response checks", async () => {
  for (const [http, expected] of [
    [200, "accepted"],
    [302, "failed"],
    [400, "failed"],
    [503, "uncertain"],
  ] as const) {
    globalThis.fetch = (async () =>
      new Response("plain text", { status: http })) as any;
    expect(
      (await openDevice("webhook", { url: "https://example.com" })).status,
    ).toBe(expected);
  }
  for (const [body, expected] of [
    [{}, "uncertain"],
    [{ error: 0 }, "accepted"],
    [{ error: 1 }, "failed"],
  ] as const) {
    globalThis.fetch = (async () => Response.json(body)) as any;
    expect(
      (
        await openDevice("webhook", {
          url: "https://example.com",
          response_mode: "ewelink",
        })
      ).status,
    ).toBe(expected);
  }
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    throw Error("secret URL transport error");
  }) as any;
  const result = await openDevice("webhook", { url: "https://example.com" });
  expect(result.status).toBe("uncertain");
  expect(result.detail).not.toContain("secret URL");
  expect(calls).toBe(1);
});

test("door API encrypts webhook configs, retains blank updates and converts legacy eWeLink safely", async () => {
  const db = openDatabase(":memory:");
  try {
    const key = "a".repeat(64),
      origin = "http://localhost:3000";
    const app = createApp(db, { key, origin, setupToken: "setup" });
    const setup = await app.request("/api/v1/auth/setup", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        setupToken: "setup",
        name: "Owner",
        email: "webhook@example.com",
        password: "strong-password",
      }),
    });
    const headers = {
      Origin: origin,
      Cookie: setup.headers.get("set-cookie")!.split(";")[0],
      "X-CSRF-Token": ((await setup.json()) as any).csrf,
      "Content-Type": "application/json",
    };
    const request = (path: string, body: unknown, method = "POST") =>
      app.request("/api/v1/" + path, {
        method,
        headers,
        body: JSON.stringify(body),
      });
    const property = (await (
      await request("properties", { name: "Test", timezone: "UTC" })
    ).json()) as any;
    const config = {
      url: "https://example.com/?token=private-token",
      method: "PUT",
      headers: '{"Authorization":"Bearer private-token"}',
      body: "unlock",
    };
    const draft = {
      propertyId: property.id,
      name: "Door",
      integration: "webhook",
      config,
    };
    const created = await request("doors", draft);
    expect(created.status).toBe(201);
    const door = (await created.json()) as any;
    const stored = () =>
      db.query("SELECT * FROM doors WHERE id=?").get(door.id) as any;
    expect(stored().secret).not.toContain("private-token");
    expect(vault(key).open(stored().secret)).toEqual(config);
    expect(
      (
        await request(
          "doors/" + door.id,
          { ...draft, config: {}, name: "Renamed" },
          "PUT",
        )
      ).status,
    ).toBe(200);
    expect(vault(key).open(stored().secret)).toEqual(config);
    expect(
      await (await app.request("/api/v1/doors", { headers })).text(),
    ).not.toContain("private-token");
    expect(
      (
        await request("doors", {
          ...draft,
          config: { url: "file:///tmp/secret" },
        })
      ).status,
    ).toBe(400);
    const legacy = (await (
      await request("doors", {
        ...draft,
        integration: "ewelink",
        config: { webhook_code: "old-secret" },
      })
    ).json()) as any;
    const list = (await (
      await app.request("/api/v1/doors", { headers })
    ).json()) as any[];
    expect(list.find((d) => d.id === legacy.id).integration).toBe("webhook");
    expect(
      (await request("doors/" + legacy.id, { ...draft, config: {} }, "PUT"))
        .status,
    ).toBe(200);
    const converted = db
      .query("SELECT * FROM doors WHERE id=?")
      .get(legacy.id) as any;
    expect(JSON.parse(converted.data).integration).toBe("webhook");
    expect(vault(key).open(converted.secret)).toEqual({
      url: "https://eu-apia.coolkit.cc/v2/smartscene2/webhooks/execute?id=old-secret",
      method: "GET",
      response_mode: "ewelink",
    });
  } finally {
    db.close();
  }
});

test("startup atomically migrates encrypted provider configs and is idempotent", () => {
  const db = openDatabase(":memory:"),
    key = "b".repeat(64),
    crypto = vault(key);
  try {
    db.query("INSERT INTO properties VALUES(?,?)").run(
      "p",
      JSON.stringify({ name: "Test", timezone: "UTC" }),
    );
    const originals: {
      id: string;
      integration: string;
      config: Record<string, string>;
    }[] = [
      {
        id: "e",
        integration: "ewelink",
        config: { webhook_code: "secret /?&" },
      },
      {
        id: "s",
        integration: "shelly",
        config: {
          host: "shelly-196-eu.shelly.cloud",
          api_key: "secret +&",
          device_id: "device-1",
        },
      },
    ];
    for (const door of originals)
      db.query("INSERT INTO doors VALUES(?,?,?,?)").run(
        door.id,
        "p",
        JSON.stringify({
          propertyId: "p",
          name: door.id,
          integration: door.integration,
          enabled: false,
          description: "Keep this",
          photos: [],
          order: 3,
        }),
        crypto.seal(door.config),
      );
    createApp(db, {
      key,
      origin: "http://localhost:3000",
      setupToken: "setup",
    });
    const rows = db.query("SELECT * FROM doors ORDER BY id").all() as any[];
    for (const row of rows) {
      expect(JSON.parse(row.data)).toMatchObject({
        integration: "webhook",
        enabled: false,
        description: "Keep this",
        order: 3,
      });
      expect(row.secret).not.toContain("secret");
    }
    expect(crypto.open(rows[0].secret)).toEqual(
      legacyWebhook(originals[0].config),
    );
    expect(crypto.open(rows[1].secret)).toEqual(
      shellyWebhook(originals[1].config),
    );
    createApp(db, {
      key,
      origin: "http://localhost:3000",
      setupToken: "setup",
    });
    expect(db.query("SELECT * FROM doors ORDER BY id").all()).toEqual(rows);
  } finally {
    db.close();
  }
});

test("a failed legacy conversion rolls back the entire migration", () => {
  const db = openDatabase(":memory:"),
    key = "c".repeat(64),
    crypto = vault(key);
  try {
    db.query("INSERT INTO properties VALUES(?,?)").run("p", "{}");
    for (const [id, integration, config] of [
      ["e", "ewelink", { webhook_code: "keep" }],
      ["s", "shelly", { host: "invalid" }],
    ] as const)
      db.query("INSERT INTO doors VALUES(?,?,?,?)").run(
        id,
        "p",
        JSON.stringify({ integration }),
        crypto.seal(config),
      );
    const before = db.query("SELECT * FROM doors ORDER BY id").all();
    expect(() =>
      createApp(db, {
        key,
        origin: "http://localhost:3000",
        setupToken: "setup",
      }),
    ).toThrow();
    expect(db.query("SELECT * FROM doors ORDER BY id").all()).toEqual(before);
  } finally {
    db.close();
  }
});

test("legacy backup imports and presets produce canonical webhook doors", () => {
  const source = openDatabase(":memory:"),
    target = openDatabase(":memory:"),
    key = "d".repeat(64),
    crypto = vault(key);
  try {
    source
      .query("INSERT INTO properties VALUES(?,?)")
      .run(
        "00000000-0000-4000-8000-000000000001",
        JSON.stringify({ name: "Test", timezone: "UTC" }),
      );
    for (const [id, integration, config] of [
      [
        "00000000-0000-4000-8000-000000000002",
        "ewelink",
        { webhook_code: "secret" },
      ],
      [
        "00000000-0000-4000-8000-000000000003",
        "shelly",
        {
          host: "shelly-196-eu.shelly.cloud",
          api_key: "key",
          device_id: "device",
        },
      ],
    ] as const)
      source
        .query("INSERT INTO doors VALUES(?,?,?,?)")
        .run(
          id,
          "00000000-0000-4000-8000-000000000001",
          JSON.stringify({
            propertyId: "00000000-0000-4000-8000-000000000001",
            name: id,
            integration,
          }),
          crypto.seal(config),
        );
    const backup = exportRecords(source, key);
    expect(backup.doors.every((d) => d.data.integration === "webhook")).toBe(
      true,
    );
    // Simulate a backup exported by an earlier version.
    const oldBackup = {
      ...backup,
      doors: backup.doors.map((d) => ({
        ...d,
        data: {
          ...d.data,
          integration:
            d.id === "00000000-0000-4000-8000-000000000002"
              ? "ewelink"
              : "shelly",
        },
        config:
          d.id === "00000000-0000-4000-8000-000000000002"
            ? { webhook_code: "secret" }
            : {
                host: "shelly-196-eu.shelly.cloud",
                api_key: "key",
                device_id: "device",
              },
      })),
    };
    restoreRecords(target, key, oldBackup, (kind, config) => {
      expect(kind).toBe("webhook");
      webhookRequest(config);
    });
    for (const d of backup.doors) {
      const stored = target
        .query("SELECT * FROM doors WHERE id=?")
        .get(d.id) as any;
      expect(JSON.parse(stored.data).integration).toBe("webhook");
      expect(crypto.open(stored.secret)).toEqual(d.config);
    }
    for (const preset of ["custom", "ewelink", "shelly"]) {
      const config = webhookPreset(preset);
      if (preset !== "custom")
        expect(() => webhookRequest(config)).not.toThrow();
      expect(config.method).toBe(preset === "shelly" ? "POST" : "GET");
    }
    expect(webhookPreset("shelly").body).toBe(
      '{"id":"YOUR_DEVICE_ID","on":true}',
    );
    expect(webhookPreset("ewelink").response_mode).toBe("ewelink");
  } finally {
    source.close();
    target.close();
  }
});
