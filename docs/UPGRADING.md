# Upgrades and backups

[Documentation](README.md) · [Getting started](GETTING_STARTED.md) · [Backup and restore reference](REFERENCE.md#backups)

- [Existing installations](#existing-installations)
- [Updates and backups](#updates-and-backups)

## Existing installations

The app is now **Guestin**. New installations use `guestin.sqlite`, Guestin cookies and `guestin-*` JSON formats. Existing database files, host/breakfast sessions and old JSON backups remain supported. Browser preferences migrate on first visit. Historical release notes and the existing GitHub repository URL keep their original identifiers.

Compose uses `alexmatter/guestin:edge` for every published tag build; set `GUESTIN_IMAGE_TAG` to `latest` for release updates or pin a build or version tag. The default volume name preserves the original `oshost_oshost-data` installation volume. If your existing stack used a different name, set `GUESTIN_DATA_VOLUME` to that exact volume before upgrading. The Compose service name is now `guestin`; use `docker compose up -d --remove-orphans` when upgrading to remove the old service container without deleting the named volume. Existing `DB_PATH` values remain supported; with no override the server detects an existing legacy database before creating a new Guestin file.

## Updates and backups

Owners can download a portable **JSON backup** under **Settings → Data management**, then upload it on another guestin installation. It includes structures, doors, guest tokens, permissions, usage, breakfast redemptions and history. Photos, user accounts and booking connector logins are excluded. Restore adds missing records and preserves the current state of existing ones. **The file contains guest tokens and device credentials: keep it private.**

Every pushed Git tag runs CI and publishes a Docker image after successful checks. Every tag build updates the Guestin `edge` image. Arbitrary tags use `tag-<sanitized-tag>-<hash>` image names; SemVer tags (with optional `v` prefix) also create a GitHub release with release notes. Stable version tags update `latest` and the `MAJOR.MINOR` alias; prereleases and build-metadata versions do not. Changes pushed to `main` run checks without publishing an image. Release notes in `docs/releases/<exact-tag>.md` take priority over GitHub-generated notes. See [AGENTS.md](../AGENTS.md) for the release preparation process.

In Portainer, update the stack with **Re-pull image** enabled. With Compose:

```sh
docker compose pull
docker compose up -d --remove-orphans
```

Keep the same stack name and data volume. The volume holds your database, uploaded images, and encryption keys. **Back it up before upgrading; deleting it deletes your installation.** The [backup and restore guide](REFERENCE.md#backups) explains how to make a recoverable backup.

Upgrading an older installation? Keep its original keys for the first upgrade; see [existing installations](REFERENCE.md#configuration).

## Server update checks

Owners can open **Settings → Server** (`/host/#/settings/server`) to see the running build and choose the installation-wide update channel: **latest** (the default; release images) or **edge** (every published tag build). The check reads a small public JSON manifest from the GitHub repository’s `update-manifests` branch: `latest.json` or `edge.json`. Each manifest identifies the published build and its multi-platform Docker image digest. GuestIn does not contact Docker Hub for update checks. Selecting a channel changes the check, not the running container: set the matching image tag in Compose or Portainer before pulling and recreating it.

The update popup appears only inside this owner-only subpage. It creates no history entry, toast, unread count or push notification. Successful checks are cached for six hours, failures for ten minutes; **Check now** bypasses the cache at most once every 30 seconds per channel. Offline checks display an unknown status. Source checkouts and older images without build IDs cannot be reliably compared. Checks become available after installing an image built with the new metadata.

The page also compares this browser’s app build with the running server. **Refresh app** downloads a waiting service worker, activates it and reloads the same page. Close other GuestIn host windows first so their work is not interrupted. Cookies, browser preferences and saved drafts are preserved. If a reload still serves an old build, Settings shows steps to close and reopen the app, and reinstall the shortcut if necessary. A browser app opened before the update checker was introduced must first be reloaded to receive it.

CI creates the `update-manifests` branch on its first successful publication. The manifest publisher runs only after the Docker push succeeds and receives that push’s image digest. Stable release builds atomically update both JSON files; other tag builds update only `edge.json`, preserving `latest.json`. Tag publication jobs are serialized so the image aliases and manifests remain aligned. The branch contains update metadata only; application code and release tags are unaffected. A failed image push never advances either manifest. If manifest publication fails after an image push, CI fails and the last published manifests remain in use.

Manifests are read without credentials from `https://raw.githubusercontent.com/<repository>/update-manifests/<channel>.json`. CI stamps the repository into the image so forks can publish their own manifests. Until a channel’s first successful manifest publication, its checker reports that no manifest is available. Publishing requires the workflow’s `contents: write` permission; running GuestIn needs no GitHub token.
