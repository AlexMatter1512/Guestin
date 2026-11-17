import { expect, test } from "bun:test";
import {
  manifestsForBuild,
  publishUpdateManifests,
} from "../scripts/publish-update-manifests";
import {
  UPDATE_MANIFEST_BRANCH,
  type BuildInfo,
} from "../shared/server-updates";

const build: BuildInfo = {
  id: "100-1",
  version: "v0.5.0",
  commit: "a".repeat(40),
  builtAt: "2026-11-17T12:00:00Z",
  image: "alexmatter/guestin",
  repository: "AlexMatter1512/guestin",
};
const digest = "sha256:" + "d".repeat(64);
const at = "2026-11-17T12:05:00Z";

function github(options: { fail?: string; conflict?: boolean } = {}) {
  let ref: string | null = null,
    counter = 0,
    conflict = options.conflict;
  const sha = () => (++counter).toString(16).padStart(40, "0");
  const trees = new Map<string, Record<string, string>>();
  const commits = new Map<
    string,
    { tree: { sha: string }; parents: string[] }
  >();
  const calls: { path: string; method: string; body: any }[] = [];
  const fetcher = async (url: string, init?: RequestInit) => {
    expect(url).toStartWith(
      "https://api.github.com/repos/AlexMatter1512/guestin/git/",
    );
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer fixture-token",
    });
    const path = url.split("/git")[1],
      method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, method, body });
    if (path === options.fail) return Response.json({}, { status: 503 });
    if (method === "GET" && path === `/ref/heads/${UPDATE_MANIFEST_BRANCH}`)
      return ref
        ? Response.json({ object: { sha: ref } })
        : Response.json({}, { status: 404 });
    if (method === "GET" && path.startsWith("/commits/"))
      return Response.json(commits.get(path.split("/").at(-1)!));
    if (method === "POST" && path === "/trees") {
      const files = { ...(body.base_tree ? trees.get(body.base_tree) : {}) };
      for (const item of body.tree) files[item.path] = item.content;
      const id = sha();
      trees.set(id, files);
      return Response.json({ sha: id }, { status: 201 });
    }
    if (method === "POST" && path === "/commits") {
      const id = sha();
      commits.set(id, { tree: { sha: body.tree }, parents: body.parents });
      return Response.json({ sha: id }, { status: 201 });
    }
    if (method === "POST" && path === "/refs") {
      expect(body.ref).toBe(`refs/heads/${UPDATE_MANIFEST_BRANCH}`);
      if (ref) return Response.json({}, { status: 422 });
      ref = body.sha;
      return Response.json({ object: { sha: ref } }, { status: 201 });
    }
    if (
      method === "PATCH" &&
      path === `/refs/heads/${UPDATE_MANIFEST_BRANCH}`
    ) {
      expect(body.force).toBe(false);
      if (conflict) {
        conflict = false;
        const tree = sha(),
          commit = sha();
        const previous = commits.get(ref!)!;
        trees.set(tree, {
          ...trees.get(previous.tree.sha),
          "README.md": "Concurrent branch edit",
        });
        commits.set(commit, { tree: { sha: tree }, parents: [ref!] });
        ref = commit;
      }
      if (commits.get(body.sha)?.parents[0] !== ref)
        return Response.json({}, { status: 422 });
      ref = body.sha;
      return Response.json({ object: { sha: ref } });
    }
    throw Error(`Unexpected GitHub request ${method} ${path}`);
  };
  const files = () => (ref ? trees.get(commits.get(ref)!.tree.sha)! : {});
  return { fetcher, calls, files, head: () => ref };
}

test("all tag builds publish edge; only stable releases also publish latest", () => {
  const stable = manifestsForBuild(build, digest, at);
  expect(stable.map((m) => m.channel)).toEqual(["edge", "latest"]);
  expect(
    stable.every((m) => m.build.id === build.id && m.digest === digest),
  ).toBe(true);
  for (const version of ["preview/foo", "v0.5.0-rc.1", "v0.5.0+build.1"])
    expect(
      manifestsForBuild({ ...build, version }, digest, at).map(
        (m) => m.channel,
      ),
    ).toEqual(["edge"]);
  expect(() => manifestsForBuild(build, "", at)).toThrow();
  expect(() => manifestsForBuild({ ...build, id: "" }, digest, at)).toThrow();
});

test("first publication creates a dedicated orphan branch and commits both channel files atomically", async () => {
  const remote = github();
  const commit = await publishUpdateManifests({
    repository: build.repository!,
    token: "fixture-token",
    manifests: manifestsForBuild(build, digest, at),
    fetcher: remote.fetcher,
  });
  expect(remote.head()).toBe(commit);
  expect(Object.keys(remote.files()).sort()).toEqual([
    "edge.json",
    "latest.json",
  ]);
  expect(JSON.parse(remote.files()["latest.json"])).toMatchObject({
    schemaVersion: 1,
    channel: "latest",
    publishedAt: at,
    build,
    digest,
  });
  expect(
    remote.calls.find((c) => c.path === "/commits" && c.method === "POST")?.body
      .parents,
  ).toEqual([]);
  expect(
    remote.calls.filter((c) => c.path === "/refs" && c.method === "POST"),
  ).toHaveLength(1);
});

test("an edge-only publication preserves latest and other files across a concurrent branch edit", async () => {
  const remote = github({ conflict: true });
  const publish = (value: BuildInfo) =>
    publishUpdateManifests({
      repository: build.repository!,
      token: "fixture-token",
      manifests: manifestsForBuild(value, digest, at),
      fetcher: remote.fetcher,
    });
  await publish(build);
  const latest = remote.files()["latest.json"];
  const edge = { ...build, id: "101-1", version: "preview/next" };
  await publish(edge);
  expect(remote.files()["latest.json"]).toBe(latest);
  expect(JSON.parse(remote.files()["edge.json"]).build.id).toBe("101-1");
  expect(remote.files()["README.md"]).toBe("Concurrent branch edit");
  expect(remote.calls.filter((c) => c.method === "PATCH")).toHaveLength(2);
});

test("publication errors leave the existing channel files untouched and are not reported as success", async () => {
  const remote = github();
  const options = {
    repository: build.repository!,
    token: "fixture-token",
    manifests: manifestsForBuild(build, digest, at),
    fetcher: remote.fetcher,
  };
  await publishUpdateManifests(options);
  const head = remote.head(),
    previous = { ...remote.files() };
  const failing = async (url: string, init?: RequestInit) =>
    url.endsWith("/commits") && init?.method === "POST"
      ? Response.json({}, { status: 503 })
      : remote.fetcher(url, init);
  await expect(
    publishUpdateManifests({ ...options, fetcher: failing }),
  ).rejects.toThrow("HTTP 503");
  expect(remote.head()).toBe(head);
  expect(remote.files()).toEqual(previous);
  const forbidden = github({ fail: `/ref/heads/${UPDATE_MANIFEST_BRANCH}` });
  await expect(
    publishUpdateManifests({ ...options, fetcher: forbidden.fetcher }),
  ).rejects.toThrow("HTTP 503");
  expect(forbidden.calls).toHaveLength(1);
});

test("untrusted destinations and missing publication metadata are refused before any GitHub write", async () => {
  const remote = github();
  const options = {
    repository: build.repository!,
    token: "fixture-token",
    manifests: manifestsForBuild(build, digest, at),
    fetcher: remote.fetcher,
  };
  await expect(
    publishUpdateManifests({ ...options, token: "" }),
  ).rejects.toThrow("GITHUB_TOKEN");
  await expect(
    publishUpdateManifests({ ...options, repository: "../other" }),
  ).rejects.toThrow();
  await expect(
    publishUpdateManifests({ ...options, repository: "another/repo" }),
  ).rejects.toThrow("does not match");
  await expect(
    publishUpdateManifests({ ...options, manifests: [] }),
  ).rejects.toThrow("one manifest");
  await expect(
    publishUpdateManifests({
      ...options,
      manifests: [options.manifests[0], options.manifests[0]],
    }),
  ).rejects.toThrow("one manifest");
  expect(remote.calls).toHaveLength(0);
});
