# Upgrades and backups

[Documentation](README.md) · [Getting started](GETTING_STARTED.md) · [Backup and restore reference](REFERENCE.md#backups)

- [Existing installations](#existing-installations)
- [Updates and backups](#updates-and-backups)

## Existing installations

The app is now **Guestin**. New installations use `guestin.sqlite`, Guestin cookies and `guestin-*` JSON formats. Existing database files, host/breakfast sessions and old JSON backups remain supported. Browser preferences migrate on first visit. Historical release notes and the existing GitHub repository URL keep their original identifiers.

Compose uses `alexmatter/guestin:edge` for build-only updates; set `GUESTIN_IMAGE_TAG` to pin a build or version tag. The default volume name preserves the original `oshost_oshost-data` installation volume. If your existing stack used a different name, set `GUESTIN_DATA_VOLUME` to that exact volume before upgrading. The Compose service name is now `guestin`; use `docker compose up -d --remove-orphans` when upgrading to remove the old service container without deleting the named volume. Existing `DB_PATH` values remain supported; with no override the server detects an existing legacy database before creating a new Guestin file.

## Updates and backups

Owners can download a portable **JSON backup** under **Settings → Data management**, then upload it on another guestin installation. It includes structures, doors, guest tokens, permissions, usage, breakfast redemptions and history. Photos, user accounts and booking connector logins are excluded. Restore adds missing records and preserves the current state of existing ones. **The file contains guest tokens and device credentials: keep it private.**

Every pushed Git tag runs CI and publishes a Docker image after successful checks. Arbitrary tags update the Guestin `edge` image and use `tag-<sanitized-tag>-<hash>` image names; SemVer tags (with optional `v` prefix) also create a GitHub release with release notes. Stable version tags update `latest` and the `MAJOR.MINOR` alias; prereleases and build-metadata versions do not. Changes pushed to `main` run checks without publishing an image. Release notes in `docs/releases/<exact-tag>.md` take priority over GitHub-generated notes. See [AGENTS.md](../AGENTS.md) for the release preparation process.

In Portainer, update the stack with **Re-pull image** enabled. With Compose:

```sh
docker compose pull
docker compose up -d --remove-orphans
```

Keep the same stack name and data volume. The volume holds your database, uploaded images, and encryption keys. **Back it up before upgrading; deleting it deletes your installation.** The [backup and restore guide](REFERENCE.md#backups) explains how to make a recoverable backup.

Upgrading an older installation? Keep its original keys for the first upgrade; see [existing installations](REFERENCE.md#configuration).
