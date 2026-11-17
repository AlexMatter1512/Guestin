import { z } from "zod";
import packagedBuild from "../shared/build.json";
import {
  UPDATE_MANIFEST_BRANCH,
  DEFAULT_UPDATE_REPOSITORY,
  repositorySchema,
  updateManifestSchema,
  type BuildInfo,
  type UpdateManifest,
} from "../shared/server-updates";
import { releaseMetadata } from "./release-metadata";

export function manifestsForBuild(
  build: BuildInfo,
  digest: string,
  publishedAt: string,
) {
  const channels = releaseMetadata(build.version).stable
    ? ["edge", "latest"]
    : ["edge"];
  return channels.map((channel) =>
    updateManifestSchema.parse({
      schemaVersion: 1,
      channel,
      publishedAt,
      build,
      digest,
    }),
  );
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
const gitSha = z.string().regex(/^[a-f0-9]{40,64}$/);

// The only writable ref is this dedicated feed branch. Each update is one
// non-forced commit, preserving the release manifest on edge-only builds.
export async function publishUpdateManifests(options: {
  repository: string;
  token: string;
  manifests: UpdateManifest[];
  fetcher?: Fetcher;
}) {
  const repository = repositorySchema.parse(options.repository);
  if (!options.token)
    throw Error("GITHUB_TOKEN is required to publish manifests");
  const manifests = options.manifests.map((value) =>
    updateManifestSchema.parse(value),
  );
  if (
    !manifests.length ||
    new Set(manifests.map((m) => m.channel)).size !== manifests.length
  )
    throw Error("Publish one manifest per channel");
  for (const manifest of manifests) {
    if (
      (manifest.build.repository ?? DEFAULT_UPDATE_REPOSITORY).toLowerCase() !==
      repository.toLowerCase()
    )
      throw Error("Build repository does not match the manifest destination");
  }
  const fetcher = options.fetcher ?? fetch;
  const root = `https://api.github.com/repos/${repository}/git`;
  async function api(path: string, method = "GET", body?: unknown) {
    const response = await fetcher(root + path, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${options.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, ok: response.ok, response };
  }
  async function required(path: string, method = "GET", body?: unknown) {
    const result = await api(path, method, body);
    if (!result.ok)
      throw Error(`GitHub manifest publication failed (HTTP ${result.status})`);
    return result.response.json();
  }
  const tree = manifests.map((manifest) => ({
    path: `${manifest.channel}.json`,
    mode: "100644",
    type: "blob",
    content: JSON.stringify(manifest, null, 2) + "\n",
  }));
  for (let attempt = 0; attempt < 3; attempt++) {
    const head = await api(`/ref/heads/${UPDATE_MANIFEST_BRANCH}`);
    if (!head.ok && head.status !== 404)
      throw Error(`Cannot read update manifest branch (HTTP ${head.status})`);
    const parent = head.ok
      ? gitSha.parse((await head.response.json()).object?.sha)
      : null;
    const base = parent
      ? gitSha.parse((await required(`/commits/${parent}`)).tree?.sha)
      : undefined;
    const createdTree = gitSha.parse(
      (
        await required("/trees", "POST", {
          ...(base ? { base_tree: base } : {}),
          tree,
        })
      ).sha,
    );
    const commit = gitSha.parse(
      (
        await required("/commits", "POST", {
          message: `Publish ${manifests.map((m) => m.channel).join(" and ")} update manifests for ${manifests[0].build.id}`,
          tree: createdTree,
          parents: parent ? [parent] : [],
        })
      ).sha,
    );
    const updated = parent
      ? await api(`/refs/heads/${UPDATE_MANIFEST_BRANCH}`, "PATCH", {
          sha: commit,
          force: false,
        })
      : await api("/refs", "POST", {
          ref: `refs/heads/${UPDATE_MANIFEST_BRANCH}`,
          sha: commit,
        });
    if (updated.ok) return commit;
    // Another writer may have advanced/created the branch. Rebase the files
    // on its new tree; do not force-push or discard the other channel.
    if (![409, 422].includes(updated.status))
      throw Error(`Cannot publish update manifests (HTTP ${updated.status})`);
  }
  throw Error("Could not publish update manifests after three attempts");
}

if (import.meta.main) {
  // CI invokes this only after build-push-action succeeds, using its digest.
  const build = {
    ...packagedBuild,
    builtAt: process.env.GUESTIN_BUILT_AT || packagedBuild.builtAt,
  };
  const manifests = manifestsForBuild(
    build,
    process.env.PUBLISHED_DIGEST ?? "",
    new Date().toISOString(),
  );
  const commit = await publishUpdateManifests({
    repository: process.env.GITHUB_REPOSITORY ?? "",
    token: process.env.GITHUB_TOKEN ?? "",
    manifests,
  });
  console.log(
    `Published ${manifests.map((m) => m.channel).join(" and ")} manifests at ${commit}`,
  );
}
