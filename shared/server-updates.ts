import { z } from "zod";

export const updateChannelSchema = z.enum(["latest", "edge"]);
export type UpdateChannel = z.infer<typeof updateChannelSchema>;
export const UPDATE_MANIFEST_BRANCH = "update-manifests";
export const DEFAULT_UPDATE_REPOSITORY = "AlexMatter1512/guestin";
export const repositorySchema = z
  .string()
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
  .refine((value) =>
    value.split("/").every((part) => part !== "." && part !== ".."),
  );
export const buildInfoSchema = z.object({
  id: z.string().max(120),
  version: z.string().max(160),
  commit: z.string().max(64),
  builtAt: z.string().max(40),
  image: z.string().regex(/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/),
  repository: repositorySchema.optional(),
});
export type BuildInfo = z.infer<typeof buildInfoSchema>;
export const updateManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    channel: updateChannelSchema,
    publishedAt: z.iso.datetime(),
    build: buildInfoSchema.extend({
      id: z.string().min(1).max(120),
      commit: z.string().regex(/^[a-f0-9]{40}$/),
      builtAt: z.iso.datetime(),
    }),
    digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();
export type UpdateManifest = z.infer<typeof updateManifestSchema>;
export const serverInfoSchema = z.object({
  channel: updateChannelSchema,
  current: buildInfoSchema,
  published: buildInfoSchema.extend({ digest: z.string() }).nullable(),
  status: z.enum(["current", "available", "ahead", "unknown"]),
  checkedAt: z.string(),
  nextCheckAt: z.string(),
  error: z.string(),
});
export type ServerInfo = z.infer<typeof serverInfoSchema>;
