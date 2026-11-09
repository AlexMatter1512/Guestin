import { test, expect } from "bun:test";
import { notificationText, wantsNotification } from "../shared/notifications";
import {
  guestTokenFromURL,
  guestURL,
  previousVisit,
} from "../apps/guest/src/lib/guest-session";
import { openDatabase } from "../server/db";
import { deliverPush } from "../server/push";
import { pruneNotifications } from "../server/notifications";
import webpush from "web-push";

test("notification titles and explanations translate in both languages and include code names", () => {
  const event = {
    type: "access.denied",
    message: "Access is not yet valid",
    context: { codeLabel: "Suite Aurora" },
  };
  expect(notificationText(event, "it")).toEqual({
    title: "Suite Aurora · Accesso negato",
    body: "Il codice non è ancora valido.",
  });
  expect(notificationText(event, "en").title).toBe(
    "Suite Aurora · Access denied",
  );
  expect(
    notificationText(
      { type: "breakfast.redeemed", message: "2 breakfast(s) redeemed" },
      "it",
    ).body,
  ).toBe("2 colazioni utilizzate.");
  const invalid = notificationText(
    {
      type: "access.invalid",
      message: "unused",
      context: {
        action: "page",
        previousVisit: {
          label: "Former code",
          date: "2026-11-01T12:00:00.000Z",
        },
      },
    },
    "it",
  );
  expect(invalid.body).toContain("pagina ospite");
  expect(invalid.body).toContain("Former code");
  expect(invalid.body).toContain("non verificata");
});

test("guest navigation retains URL credentials and never recovers them from storage", () => {
  const original = "https://stay.example/guest/#code=secret-token&lang=it";
  const breakfast = guestURL(original, "breakfast", "en");
  expect(breakfast).toBe("/guest/?lang=en#code=secret-token&page=breakfast");
  expect(guestTokenFromURL(new URL(breakfast, original).href)).toBe(
    "secret-token",
  );
  expect(
    guestURL("https://stay.example/guest/#/doors", "breakfast", "it"),
  ).toBe("/guest/?lang=it#page=breakfast");
  expect(
    guestTokenFromURL(
      "https://stay.example/guest/?code=do-not-use-query#/doors",
    ),
  ).toBe("");
  const hint = previousVisit({
    getItem: () =>
      JSON.stringify({
        label: "Aurora",
        date: "2026-11-01T12:00:00.000Z",
        code: "never-return-this",
      }),
  });
  expect(hint).toEqual({ label: "Aurora", date: "2026-11-01T12:00:00.000Z" });
  for (const value of [
    "not json",
    "null",
    '{"label":"x","date":"bad"}',
    JSON.stringify({ label: "x".repeat(121), date: new Date().toISOString() }),
  ])
    expect(previousVisit({ getItem: () => value })).toBeUndefined();
});

test("push uses the device language, code title and shared event context; retention removes that context", async () => {
  const db = openDatabase(":memory:"),
    keys = webpush.generateVAPIDKeys();
  const oldPublic = process.env.VAPID_PUBLIC_KEY,
    oldPrivate = process.env.VAPID_PRIVATE_KEY;
  process.env.VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.VAPID_PRIVATE_KEY = keys.privateKey;
  try {
    db.query("INSERT INTO users VALUES(?,?,?,?,?)").run(
      "u",
      "Host",
      "h@example.test",
      "hash",
      "owner",
    );
    db.query("INSERT INTO properties VALUES(?,?)").run(
      "p",
      JSON.stringify({ name: "Casa", timezone: "UTC" }),
    );
    db.query("INSERT INTO subscriptions VALUES(?,?,?,?)").run(
      "s",
      "u",
      "{}",
      JSON.stringify({
        properties: ["p"],
        events: ["access.invalid"],
        language: "it",
      }),
    );
    db.query("INSERT INTO events VALUES(?,?,?,?,?,?)").run(
      "e",
      null,
      null,
      "access.invalid",
      "An invalid or revoked guest link was attempted",
      new Date().toISOString(),
    );
    db.query("INSERT INTO event_context VALUES(?,?)").run(
      "e",
      JSON.stringify({ action: "page", codeLabel: "Aurora" }),
    );
    db.query(
      "INSERT INTO jobs(event_id,subscription_id,next) VALUES(?,?,?)",
    ).run("e", "s", 0);
    const payloads: any[] = [];
    await deliverPush(db, (async (_subscription: any, payload: string) => {
      payloads.push(JSON.parse(payload));
    }) as any);
    expect(payloads).toHaveLength(1); // Invalid unknown links must reach a device with a structure filter.
    expect(payloads[0].title).toBe("Aurora · Tentativo con codice non valido");
    expect(payloads[0].body).toContain("pagina ospite");
    expect(db.query("SELECT * FROM jobs").all()).toHaveLength(0);
    db.query("UPDATE events SET created='2000-01-01T00:00:00.000Z'").run();
    pruneNotifications(db);
    expect(db.query("SELECT * FROM event_context").all()).toHaveLength(0);
  } finally {
    if (oldPublic) process.env.VAPID_PUBLIC_KEY = oldPublic;
    else delete process.env.VAPID_PUBLIC_KEY;
    if (oldPrivate) process.env.VAPID_PRIVATE_KEY = oldPrivate;
    else delete process.env.VAPID_PRIVATE_KEY;
    db.close();
  }
});

test("structure and event push filters support explicit opt-outs and legacy defaults", () => {
  expect(wantsNotification({}, "p1", "access.invalid")).toBe(true);
  expect(
    wantsNotification(
      { properties: [], allProperties: false },
      null,
      "access.invalid",
    ),
  ).toBe(false);
  expect(
    wantsNotification(
      { properties: [], allProperties: false },
      "p1",
      "access.invalid",
    ),
  ).toBe(false);
  expect(
    wantsNotification(
      { properties: ["p1"], allProperties: false },
      "p2",
      "access.accepted",
    ),
  ).toBe(false);
  expect(
    wantsNotification(
      {
        properties: ["p1"],
        allProperties: false,
        events: ["access.invalid"],
        allEvents: false,
      },
      null,
      "access.invalid",
    ),
  ).toBe(true);
  expect(
    wantsNotification({ events: [], allEvents: false }, "p1", "access.invalid"),
  ).toBe(false);
});
test("door test messages preserve the provider detail once in both languages", () => {
  const event = {
    type: "device.test.failed",
    message: "unused",
    context: {
      actor: "Alex: Host",
      doorName: "Entrance",
      detail: "Provider reported a failure",
    },
  };
  expect(notificationText(event, "en").body).toBe(
    "Alex: Host · Entrance: Provider reported a failure",
  );
  expect(notificationText(event, "it").body).toBe(
    "Alex: Host · Entrance: Il fornitore ha segnalato un errore.",
  );
});
