import { expect, test } from "bun:test";
import {
  formatDate,
  formatDateTime,
  parseDisplayDate,
} from "../shared/date-format";
import { createApp } from "../server/app";
import { openDatabase } from "../server/db";
import { digest } from "../server/security";
import type { GuestPageSettings } from "../shared/guest-page";
import { sessionCookie } from "../server/branding";
import { realtime, websocket } from "../server/realtime";
import { localDate } from "../shared/schema";
import { doorTransferSchema } from "../shared/record-transfer";
import { backupSchema } from "../shared/backup";

test("shared dates honor every configured format, timezone, date-only safety and strict input validation", () => {
  expect(formatDate("2026-11-10")).toBe("10/11/2026");
  expect(formatDate("2026-11-10", "mm/dd/yyyy", "America/Los_Angeles")).toBe(
    "11/10/2026",
  );
  expect(formatDate("2026-11-10", "yyyy-mm-dd")).toBe("2026-11-10");
  expect(
    formatDateTime("2026-11-10T00:30:00Z", "mm/dd/yyyy", "America/New_York"),
  ).toBe("11/09/2026 19:30");
  expect(parseDisplayDate("10/11/2026 15:30", "dd/mm/yyyy", true)).toBe(
    "2026-11-10T15:30",
  );
  expect(parseDisplayDate("11/10/2026", "mm/dd/yyyy")).toBe("2026-11-10");
  for (const value of [
    "31/02/2026",
    "00/01/2026",
    "1/1/2026",
    "10/11/2026 25:00",
  ])
    expect(
      parseDisplayDate(value, "dd/mm/yyyy", value.includes(" ")),
    ).toBeNull();
});

function fixture() {
  const db = openDatabase(":memory:"),
    origin = "http://fixture.example";
  for (const role of ["owner", "collaborator"]) {
    db.query("INSERT INTO users VALUES(?,?,?,?,?)").run(
      role,
      role,
      role + "@example.test",
      "unused",
      role,
    );
    db.query("INSERT INTO sessions VALUES(?,?,?,?)").run(
      digest(role),
      role,
      "csrf",
      Date.now() + 600000,
    );
  }
  const app = createApp(db, {
    key: "a".repeat(64),
    origin,
    setupToken: "unused",
    device: async () => {
      throw Error("Unexpected device request");
    },
  });
  async function req(
    path: string,
    body?: any,
    role = "owner",
    method = body === undefined ? "GET" : "POST",
    extra: Record<string, string> = {},
  ) {
    return app.request("/api/v1/" + path, {
      method,
      headers: {
        Origin: origin,
        Cookie: `guestin_session=${role}`,
        "X-CSRF-Token": "csrf",
        "Content-Type": "application/json",
        ...extra,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  return { db, app, origin, req };
}

test("guest branding is owner-managed, validated and scoped to the linked property", async () => {
  const f = fixture();
  const logo =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRJoAAAAASUVORK5CYII=";
  try {
    const branded = (await (
      await f.req("properties", { name: "Branded", timezone: "UTC", logo })
    ).json()) as { id: string };
    const plain = (await (
      await f.req("properties", { name: "Plain", timezone: "UTC" })
    ).json()) as { id: string };
    const invalidLogo = await f.req(
      `properties/${branded.id}`,
      { logo: "data:image/png;base64,ZmFrZQ==" },
      "owner",
      "PUT",
    );
    expect(invalidLogo.status).toBe(400);
    const path = `properties/${branded.id}/guest-page`;
    const settings = {
      showLogo: true,
      accentColor: "#fafafa",
      introMarkdown: "## Welcome",
      singleUseMarkdown: "Take the <u>keys</u>.",
    };
    expect(
      (await f.req(path, { guestPage: settings }, "collaborator", "PATCH"))
        .status,
    ).toBe(403);
    expect(
      (
        await f.req(
          path,
          { guestPage: { ...settings, accentColor: "transparent" } },
          "owner",
          "PATCH",
        )
      ).status,
    ).toBe(400);
    expect(
      (await f.req(path, { guestPage: settings }, "owner", "PATCH")).status,
    ).toBe(200);
    async function guestToken(propertyId: string) {
      const code = (await (
        await f.req("codes", { propertyId, label: "Guest", grants: [] })
      ).json()) as { link: string };
      return new URLSearchParams(new URL(code.link).hash.slice(1)).get("code")!;
    }
    async function branding(token: string) {
      const response = await f.req("guest", undefined, "anonymous", "GET", {
        Authorization: "Bearer " + token,
      });
      expect(response.status).toBe(200);
      return ((await response.json()) as { guestPage: unknown }).guestPage;
    }
    const token = await guestToken(branded.id);
    const localized: GuestPageSettings = {
      showLogo: settings.showLogo,
      accentColor: settings.accentColor,
      intro: {
        defaultLanguage: "en",
        translations: { en: settings.introMarkdown },
      },
      singleUse: {
        defaultLanguage: "en",
        translations: { en: settings.singleUseMarkdown },
      },
    };
    expect(await branding(token)).toEqual({ ...localized, logo });
    expect(await branding(await guestToken(plain.id))).toEqual({
      showLogo: false,
      accentColor: null,
      intro: { defaultLanguage: "en", translations: {} },
      singleUse: { defaultLanguage: "en", translations: {} },
      logo: null,
    });
    expect(
      (
        await f.req(
          path,
          { guestPage: { ...settings, showLogo: false } },
          "owner",
          "PATCH",
        )
      ).status,
    ).toBe(200);
    expect(await branding(token)).toEqual({
      ...localized,
      showLogo: false,
      logo: null,
    });
    const versionsPath = path + "/versions";
    const versions = (await (await f.req(versionsPath)).json()) as {
      guestPage: unknown;
    }[];
    expect(versions.map((version) => version.guestPage)).toEqual([
      localized,
      {
        showLogo: false,
        accentColor: null,
        intro: { defaultLanguage: "en", translations: {} },
        singleUse: { defaultLanguage: "en", translations: {} },
      },
    ]);
    for (let i = 0; i < 12; i++) {
      const next = {
        ...localized,
        intro: {
          defaultLanguage: "fr",
          translations: { fr: "Version " + i, en: "Welcome" },
        },
      };
      expect(
        (await f.req(path, { guestPage: next }, "owner", "PATCH")).status,
      ).toBe(200);
    }
    const recent = (await (await f.req(versionsPath)).json()) as {
      guestPage: typeof localized;
    }[];
    expect(recent).toHaveLength(10);
    expect(recent[0].guestPage.intro.translations).toEqual({
      en: "Welcome",
      fr: "Version 10",
    });
    const door = (await (
      await f.req("doors", {
        propertyId: branded.id,
        name: "Entry",
        integration: "none",
        config: {},
        singleUse: true,
      })
    ).json()) as { id: string };
    const previewPath = path + "/preview?door=" + door.id;
    expect((await f.req(previewPath, undefined, "anonymous")).status).toBe(401);
    expect(
      (await f.req(`properties/${plain.id}/guest-page/preview?door=${door.id}`))
        .status,
    ).toBe(404);
    const preview = await (await f.req(previewPath)).json();
    expect(preview).toMatchObject({
      preview: true,
      doors: [{ id: door.id, singleUse: true }],
      guestPage: { intro: { translations: { fr: "Version 11" } } },
    });
    expect(preview).not.toHaveProperty("codeId");
  } finally {
    f.db.close();
  }
});

test("workspace date format is owner-managed, defaults to day/month/year and propagates to public and guest responses", async () => {
  const f = fixture();
  try {
    expect(
      await (await f.req("public/settings", undefined, "anonymous")).json(),
    ).toEqual({ dateFormat: "dd/mm/yyyy" });
    expect(
      (
        await f.req(
          "settings",
          { dateFormat: "mm/dd/yyyy" },
          "collaborator",
          "PUT",
        )
      ).status,
    ).toBe(403);
    expect(
      (await f.req("settings", { dateFormat: "other" }, "owner", "PUT")).status,
    ).toBe(400);
    expect(
      (await f.req("settings", { dateFormat: "mm/dd/yyyy" }, "owner", "PUT"))
        .status,
    ).toBe(200);
    const p = (await (
      await f.req("properties", { name: "House", timezone: "UTC" })
    ).json()) as any;
    const code = (await (
      await f.req("codes", { propertyId: p.id, label: "Guest", grants: [] })
    ).json()) as any;
    const token = new URLSearchParams(new URL(code.link).hash.slice(1)).get(
      "code",
    )!;
    const guest = (await (
      await f.req("guest", undefined, "anonymous", "GET", {
        Authorization: `Bearer ${token}`,
      })
    ).json()) as any;
    expect(guest.dateFormat).toBe("mm/dd/yyyy");
    const totals = (await (
      await f.req(`public/breakfast/${p.id}`, undefined, "anonymous")
    ).json()) as any;
    expect(totals.dateFormat).toBe("mm/dd/yyyy");
    expect(totals.date).toBe(localDate("UTC"));
    expect(sessionCookie("oshost_session=owner")).toBe("owner");
    expect(
      (
        await f.req("settings", undefined, "anonymous", "GET", {
          Cookie: "oshost_session=owner",
        })
      ).status,
    ).toBe(200);
    expect(
      (f.db.query("SELECT date_format FROM display_settings").get() as any)
        .date_format,
    ).toBe("mm/dd/yyyy");
  } finally {
    f.db.close();
  }
});

test("legacy portable files remain importable while new files use Guestin names", () => {
  const propertyId = crypto.randomUUID();
  const doors = doorTransferSchema.parse({
    format: "oshost-doors",
    version: 1,
    exportedAt: new Date().toISOString(),
    propertyId,
    doors: [],
  });
  expect(doors.format).toBe("guestin-doors");
  expect(
    backupSchema.parse({
      format: "oshost-json",
      version: 1,
      exportedAt: new Date().toISOString(),
      properties: [],
      doors: [],
      codes: [],
      events: [],
    }).format,
  ).toBe("guestin-json");
});

test("breakfast sockets enforce origin/password scope, send only refresh signals and close when access expires", async () => {
  const f = fixture();
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    websocket,
    fetch: (req, server) => f.app.fetch(req, { server }),
  });
  const sockets: WebSocket[] = [];
  const waitFor = async (check: () => boolean) => {
    for (let i = 0; i < 100 && !check(); i++) await Bun.sleep(10);
    expect(check()).toBe(true);
  };
  try {
    const a = (await (
      await f.req("properties", { name: "Private house", timezone: "UTC" })
    ).json()) as any;
    const b = (await (
      await f.req("properties", { name: "Other house", timezone: "UTC" })
    ).json()) as any;
    await f.req(
      `properties/${a.id}/breakfast-settings`,
      { enabled: true, password: "breakfast-test-password" },
      "owner",
      "PUT",
    );
    const url = `http://127.0.0.1:${server.port}/api/v1/public/breakfast/${a.id}/live`;
    expect((await fetch(url, { headers: { Origin: f.origin } })).status).toBe(
      401,
    );
    expect(
      (await fetch(url, { headers: { Origin: "http://evil.example" } })).status,
    ).toBe(403);
    f.db
      .query("INSERT INTO breakfast_sessions VALUES(?,?,?)")
      .run(digest("breakfast-cookie"), a.id, Date.now() + 600000);
    const connect = (id: string, cookie = "") => {
      const messages: any[] = [];
      const ws = new WebSocket(
        `ws://127.0.0.1:${server.port}/api/v1/public/breakfast/${id}/live`,
        { headers: { Origin: f.origin, Cookie: cookie } } as any,
      );
      sockets.push(ws);
      ws.onmessage = (e) => messages.push(JSON.parse(String(e.data)));
      return { ws, messages };
    };
    const first = connect(a.id, `guestin_breakfast_${a.id}=breakfast-cookie`),
      other = connect(b.id);
    await waitFor(() => first.messages.length > 0 && other.messages.length > 0);
    const today = localDate("UTC");
    const code = (await (
      await f.req("codes", {
        propertyId: a.id,
        label: "Private guest name",
        grants: [],
        breakfast: { total: 4, start: today, end: today },
      })
    ).json()) as any;
    const token = new URLSearchParams(new URL(code.link).hash.slice(1)).get(
      "code",
    )!;
    await f.req("guest/breakfast", { quantity: 1 }, "anonymous", "POST", {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": crypto.randomUUID(),
    });
    await waitFor(() =>
      first.messages.some((m) => m.type === "breakfast.changed"),
    );
    expect(first.messages).toEqual([
      { type: "sync" },
      { type: "breakfast.changed" },
    ]);
    expect(other.messages).toEqual([{ type: "sync" }]);
    let closed = false;
    first.ws.onclose = (e) => {
      closed = e.code === 1008;
    };
    f.db.query("UPDATE breakfast_sessions SET expires=0").run();
    realtime(f.db).heartbeat();
    await waitFor(() => closed);
    expect(
      first.messages.some((m) => JSON.stringify(m).includes("Private guest")),
    ).toBe(false);
    expect(other.ws.readyState).toBe(WebSocket.OPEN);
  } finally {
    for (const ws of sockets) ws.close();
    server.stop(true);
    f.db.close();
  }
}, 10000);
