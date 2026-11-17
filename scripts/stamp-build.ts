import {
  buildInfoSchema,
  DEFAULT_UPDATE_REPOSITORY,
} from "../shared/server-updates";
import { resolve } from "node:path";

export function buildStamp(env: Record<string, string | undefined>) {
  return buildInfoSchema.parse({
    id: env.GUESTIN_BUILD_ID ?? "",
    version: env.GUESTIN_VERSION || "development",
    commit: env.GUESTIN_COMMIT ?? "",
    builtAt: env.GUESTIN_BUILT_AT || new Date().toISOString(),
    image: env.GUESTIN_IMAGE || "alexmatter/guestin",
    repository: env.GUESTIN_REPOSITORY || DEFAULT_UPDATE_REPOSITORY,
  });
}

if (import.meta.main)
  await Bun.write(
    resolve(import.meta.dir, "../shared/build.json"),
    JSON.stringify(buildStamp(process.env), null, 2) + "\n",
  );
