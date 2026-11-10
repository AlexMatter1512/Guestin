import { createHash } from "node:crypto";
import { appendFileSync } from "node:fs";

// SemVer numeric identifiers must not have leading zeroes.
const version =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
export function releaseMetadata(tag: string) {
  const match = version.exec(tag);
  const hash = createHash("sha256").update(tag).digest("hex").slice(0, 12);
  // Prefix arbitrary tags to avoid clobbering latest, sha-* or version aliases.
  const imageTag = match
    ? tag.replace(/^v/, "").replaceAll("+", "_")
    : `tag-${tag.replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 90)}-${hash}`;
  return {
    is_version: !!match,
    prerelease: !!match?.[4],
    stable: !!match && !match[4] && !match[5] && imageTag.length <= 128,
    image_tag: imageTag.length <= 128 ? imageTag : `tag-${hash}`,
    minor: match ? `${match[1]}.${match[2]}` : "",
  };
}
if (import.meta.main) {
  const output =
    Object.entries(releaseMetadata(process.env.RELEASE_TAG ?? ""))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n";
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, output);
  else process.stdout.write(output);
}
