import packagedBuild from "../shared/build.json";
import {
  buildInfoSchema,
  updateChannelSchema,
  updateManifestSchema,
  repositorySchema,
  DEFAULT_UPDATE_REPOSITORY,
  UPDATE_MANIFEST_BRANCH,
  type BuildInfo,
  type ServerInfo,
  type UpdateChannel,
} from "../shared/server-updates";

export const installedBuild = buildInfoSchema.parse(packagedBuild);
export type UpdateFetcher = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;
type PublishedBuild = NonNullable<ServerInfo["published"]>;

// One small public GitHub manifest. No registry credentials or image downloads.
export async function publishedBuild(
  image: string,
  channel: UpdateChannel,
  fetcher: UpdateFetcher = fetch,
  repository = DEFAULT_UPDATE_REPOSITORY,
): Promise<PublishedBuild> {
  buildInfoSchema.shape.image.parse(image);
  updateChannelSchema.parse(channel);
  repositorySchema.parse(repository);
  // Avoid a previously cached raw-GitHub response after a fresh publication.
  const url = `https://raw.githubusercontent.com/${repository}/${UPDATE_MANIFEST_BRANCH}/${channel}.json?check=${Date.now()}`;
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(8000),
    redirect: "error",
    cache: "no-store",
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
  });
  if (response.status === 404)
    throw Error(
      "No update manifest has been published for the selected channel yet.",
    );
  if (!response.ok)
    throw Error(`GitHub update manifest returned HTTP ${response.status}`);
  if (!response.body) throw Error("GitHub returned an empty update manifest");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "",
    bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 16384) throw Error("Update manifest is too large");
      text += decoder.decode(value, { stream: true });
    }
    const manifest = updateManifestSchema.parse(
      JSON.parse(text + decoder.decode()),
    );
    if (
      manifest.channel !== channel ||
      manifest.build.image !== image ||
      (manifest.build.repository &&
        manifest.build.repository.toLowerCase() !== repository.toLowerCase())
    )
      throw Error(
        "Update manifest does not match this installation and channel",
      );
    return { ...manifest.build, digest: manifest.digest };
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function updateStatus(
  current: BuildInfo,
  published: PublishedBuild | null,
): ServerInfo["status"] {
  if (!current.id || !published) return "unknown";
  if (current.id === published.id) return "current";
  // Do not offer a downgrade when an edge installation checks the release channel.
  const semver =
    /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
  if (
    semver.test(current.version) &&
    semver.test(published.version) &&
    Bun.semver.order(
      current.version.replace(/^v/, ""),
      published.version.replace(/^v/, ""),
    ) > 0
  )
    return "ahead";
  return "available";
}

export function createUpdateChecker(
  options: {
    current?: BuildInfo;
    fetcher?: UpdateFetcher;
    now?: () => number;
  } = {},
) {
  const current = options.current ?? installedBuild;
  const now = options.now ?? Date.now;
  const cache = new Map<
    UpdateChannel,
    { value: ServerInfo; at: number; ttl: number }
  >();
  const pending = new Map<UpdateChannel, Promise<ServerInfo>>();
  return async (
    channel: UpdateChannel,
    refresh = false,
  ): Promise<ServerInfo> => {
    const running = pending.get(channel);
    if (running) return running;
    const previous = cache.get(channel),
      at = now();
    // A manual check may bypass the TTL, at most once per 30 seconds per channel.
    if (previous && at - previous.at < (refresh ? 30000 : previous.ttl))
      return previous.value;
    const work = (async () => {
      let published = previous?.value.published ?? null,
        error = "";
      try {
        published = await publishedBuild(
          current.image,
          channel,
          options.fetcher,
          current.repository ?? DEFAULT_UPDATE_REPOSITORY,
        );
      } catch (e) {
        error = (e instanceof Error ? e.message : "Update check failed").slice(
          0,
          300,
        );
      }
      const ttl = error ? 10 * 60000 : 6 * 3600000;
      const value: ServerInfo = {
        channel,
        current,
        published,
        status: error ? "unknown" : updateStatus(current, published),
        checkedAt: new Date(at).toISOString(),
        nextCheckAt: new Date(at + ttl).toISOString(),
        error,
      };
      cache.set(channel, { value, at, ttl });
      return value;
    })();
    pending.set(channel, work);
    try {
      return await work;
    } finally {
      pending.delete(channel);
    }
  };
}
