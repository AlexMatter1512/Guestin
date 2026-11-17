import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app";
import { openDatabase } from "../server/db";
import { digest } from "../server/security";
import {
  createUpdateChecker,
  publishedBuild,
  updateStatus,
  type UpdateFetcher,
} from "../server/server-updates";
import type { BuildInfo } from "../shared/server-updates";
import { buildStamp } from "../scripts/stamp-build";

const current: BuildInfo = {
  id: "100-1",
  version: "v0.4.0",
  commit: "a".repeat(40),
  builtAt: "2026-11-17T12:00:00Z",
  image: "alexmatter/guestin",
};
const sha = (char: string) => "sha256:" + char.repeat(64);
function manifestFeed(
  options: { id?: string; version?: string; fail?: number } = {},
) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher: UpdateFetcher = async (url, init) => {
    calls.push({ url, init });
    if (options.fail)
      return new Response("unavailable", { status: options.fail });
    return Response.json({
      schemaVersion: 1,
      channel: new URL(url).pathname.endsWith("/edge.json") ? "edge" : "latest",
      publishedAt: "2026-11-17T13:05:00Z",
      build: {
        ...current,
        id: options.id ?? "101-1",
        version: options.version ?? "v0.5.0",
      },
      digest: sha("e"),
    });
  };
  return { calls, fetcher };
}

test("published build reads one public GitHub manifest, with no registry or authentication requests", async () => {
  const r = manifestFeed();
  const published = await publishedBuild(current.image, "edge", r.fetcher);
  expect(published).toMatchObject({
    id: "101-1",
    version: "v0.5.0",
    digest: sha("e"),
  });
  expect(r.calls).toHaveLength(1);
  expect(r.calls[0].url).toStartWith(
    "https://raw.githubusercontent.com/AlexMatter1512/guestin/update-manifests/edge.json?check=",
  );
  expect(r.calls[0].init).toMatchObject({
    redirect: "error",
    cache: "no-store",
  });
  expect(r.calls[0].init?.headers).not.toHaveProperty("Authorization");
});

test("manifests validate schema, channel, image and repository, and cannot redirect the checker", async () => {
  const valid = await (
    await manifestFeed().fetcher("https://example/latest.json")
  ).json();
  for (const wrong of [
    { ...valid, schemaVersion: 2 },
    { ...valid, channel: "edge" },
    { ...valid, digest: "https://private.example/" },
    { ...valid, build: { ...valid.build, id: "" } },
    { ...valid, build: { ...valid.build, image: "another/image" } },
    { ...valid, build: { ...valid.build, repository: "another/repo" } },
  ]) {
    await expect(
      publishedBuild(current.image, "latest", async () => Response.json(wrong)),
    ).rejects.toThrow();
  }
  await expect(
    publishedBuild(
      current.image,
      "latest",
      async () => new Response("x".repeat(16385)),
    ),
  ).rejects.toThrow("too large");
  await expect(
    publishedBuild(
      current.image,
      "latest",
      manifestFeed({ fail: 404 }).fetcher,
    ),
  ).rejects.toThrow("No update manifest");
  const r = manifestFeed();
  await expect(
    publishedBuild(current.image, "latest", r.fetcher, "../../private"),
  ).rejects.toThrow();
  expect(r.calls).toHaveLength(0);
});

test("image checks cache independently per channel, deduplicate requests and limit forced refreshes", async () => {
  let now = Date.parse(current.builtAt);
  const r = manifestFeed();
  const check = createUpdateChecker({
    current,
    fetcher: r.fetcher,
    now: () => now,
  });
  const [first, same] = await Promise.all([check("latest"), check("latest")]);
  expect(first).toEqual(same);
  expect(first.status).toBe("available");
  expect(r.calls).toHaveLength(1);
  await check("latest", true);
  expect(r.calls).toHaveLength(1);
  now += 30001;
  await check("latest", true);
  expect(r.calls).toHaveLength(2);
  await check("edge");
  expect(r.calls).toHaveLength(3);
  now += 6 * 3600000;
  await check("latest");
  expect(r.calls).toHaveLength(4);
});

test("network failures are unknown, cached briefly, and retain explicitly stale metadata", async () => {
  let now = Date.parse(current.builtAt),
    failing = false;
  const r = manifestFeed();
  const check = createUpdateChecker({
    current,
    now: () => now,
    fetcher: async (url, init) => {
      if (failing) throw Error("fixture offline");
      return r.fetcher(url, init);
    },
  });
  const good = await check("latest");
  failing = true;
  now += 6 * 3600000;
  const failed = await check("latest");
  expect(failed.status).toBe("unknown");
  expect(failed.error).toBe("fixture offline");
  expect(failed.published).toEqual(good.published);
  expect(Date.parse(failed.nextCheckAt) - Date.parse(failed.checkedAt)).toBe(
    10 * 60000,
  );
  failing = false;
  now += 9 * 60000;
  expect((await check("latest")).error).toBe("fixture offline");
  now += 60001;
  expect((await check("latest")).status).toBe("available");
});

test("versions do not offer downgrades; rebuilt or arbitrary-tag images use unique build identity", () => {
  const published = { ...current, digest: sha("a") };
  expect(updateStatus(current, published)).toBe("current");
  expect(updateStatus(current, { ...published, id: "rebuilt" })).toBe(
    "available",
  );
  expect(
    updateStatus(current, { ...published, id: "older", version: "v0.3.0" }),
  ).toBe("ahead");
  expect(
    updateStatus(
      { ...current, version: "v0.5.0-rc.1" },
      { ...published, id: "release", version: "v0.5.0" },
    ),
  ).toBe("available");
  expect(
    updateStatus(current, {
      ...published,
      id: "tag-build",
      version: "preview/foo",
    }),
  ).toBe("available");
  expect(
    updateStatus(
      { ...current, version: "v01.2.3" },
      { ...published, id: "different" },
    ),
  ).toBe("available");
  expect(updateStatus({ ...current, id: "" }, published)).toBe("unknown");
});

test("Server settings are owner-only, default to latest, persist across restarts and never create notifications", async () => {
  const directory = mkdtempSync(join(tmpdir(), "guestin-server-settings-"));
  const path = join(directory, "test.sqlite");
  let db = openDatabase(path);
  const r = manifestFeed();
  for (const role of ["owner", "collaborator"]) {
    db.query("INSERT INTO users VALUES(?,?,?,?,?)").run(
      role,
      role,
      `${role}@example.test`,
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
  const app = () =>
    createApp(db, {
      key: "a".repeat(64),
      origin: "http://fixture.example",
      setupToken: "fixture",
      updates: { current, fetcher: r.fetcher },
      device: async () => {
        throw Error("Unexpected device request");
      },
    });
  let instance = app();
  const req = (role: string, method = "GET", body?: unknown, csrf = "csrf") =>
    instance.request("/api/v1/admin/server", {
      method,
      headers: {
        Origin: "http://fixture.example",
        Cookie: `guestin_session=${role}`,
        "X-CSRF-Token": csrf,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  try {
    expect((await req("anonymous")).status).toBe(401);
    expect((await req("collaborator")).status).toBe(403);
    expect((await req("collaborator", "PUT", { channel: "edge" })).status).toBe(
      403,
    );
    expect(r.calls).toHaveLength(0);
    const initial = await req("owner");
    expect(initial.headers.get("cache-control")).toBe("no-store");
    expect(await initial.json()).toMatchObject({
      channel: "latest",
      status: "available",
      current,
    });
    expect((await req("owner", "PUT", { channel: "main" })).status).toBe(400);
    expect(
      (await req("owner", "PUT", { channel: "edge", url: "http://private" }))
        .status,
    ).toBe(400);
    expect((await req("owner", "PUT", { channel: "edge" }, "bad")).status).toBe(
      403,
    );
    expect((await req("owner", "PUT", { channel: "edge" })).status).toBe(200);
    db.close();
    db = openDatabase(path);
    instance = app();
    expect(await (await req("owner")).json()).toMatchObject({
      channel: "edge",
      status: "available",
    });
    expect(db.query("SELECT * FROM events").all()).toHaveLength(0);
    expect(db.query("SELECT * FROM jobs").all()).toHaveLength(0);
    const publicBuild = await instance.request("/api/v1/public/build");
    expect(await publicBuild.json()).toEqual({
      id: current.id,
      version: current.version,
    });
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("build stamps validate image names and preserve exact tag and CI run identities", () => {
  expect(
    buildStamp({
      GUESTIN_BUILD_ID: "100-2",
      GUESTIN_VERSION: "preview/foo",
      GUESTIN_COMMIT: "abc",
    }),
  ).toMatchObject({
    id: "100-2",
    version: "preview/foo",
    commit: "abc",
    image: "alexmatter/guestin",
  });
  expect(() =>
    buildStamp({ GUESTIN_IMAGE: "https://private.example" }),
  ).toThrow();
});
