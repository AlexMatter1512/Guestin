# build-20261117-code-timeline

Edge build prepared on 2026-11-17. This arbitrary build tag publishes `alexmatter/guestin:edge` and immutable build/SHA image tags after CI succeeds. It does not update `latest` or create a GitHub version release.

## Reviewed comparison

- Previous published version: **v0.4.0** (`4e3f0ef`). Reviewed the commit history and cumulative source diff from that release, including the earlier changes documented in `build-20261117-server-updates-2.md`.
- Previous published edge build: **build-20261117-server-updates-2** (`8bc565d`). Reviewed `git log build-20261117-server-updates-2..HEAD`, the corresponding full diff, and staged/unstaged changes. This build adds the merged code-timeline worktree (`86b0`); its original checkout remains unchanged.
- The application merge is `861cab8`; the tag also includes these reviewed notes. The unrelated local `.DS_Store` is excluded.

## Changes since the preceding edge build

- Show an activity timeline in access-code details, newest first, with localized timestamps, live refresh, older-event pagination and retry handling.
- Filter activity by access code before pagination. Include the selected code's guest and staff events without marking them read.
- Simplify code details to the guest link, activity and a collapsible Doors section. Move link replacement, revocation and permanent deletion into the edit form's Manage access section.
- Use the edit form's door switches to enable or disable permissions. Retain disabled doors and their successful-request counts across edits, reloads and re-enabling, including when an older client omits a disabled grant. Preserve consumed single-use permissions.
- Match permission-history behavior in the fictional browser demos and support code-specific demo activity.

## Earlier changes since v0.4.0

The complete release comparison also includes Guestin branding and MIT licensing, revised installation/upgrade documentation, a live bilingual breakfast app, shared date formats, isolated landing demos, Guest/Staff notification history, breakfast link sharing, and owner-only Server settings for latest/edge update checks and stale-webapp recovery. GitHub channel manifests are published only after their Docker images. See `build-20261117-server-updates-2.md` for the reviewed details of those earlier edge builds.

## Security and compatibility

- Existing authentication and notification visibility restrictions apply to code activity; malformed code identifiers are rejected. Timeline reads do not change notification read state.
- No new schema migration is introduced after the preceding edge build. Upgrades from v0.4.0 still apply schema 10 (date formats) and schema 11 (server update channel). Preserve the database, keys and uploaded assets as described in `docs/UPGRADING.md`.
- Omitted door grants now remain stored as disabled permissions, preserving usage history. Existing links remain valid subject to the code's current permissions, revocation and single-use state.

## Validation

- `bun run check` passed with no Svelte errors or warnings.
- `LOG_FILE=- bun test` passed: **169 tests** across 32 files.
- `bun run build` passed for both applications.
- `bun scripts/staff-codes-smoke.ts` passed, covering the live activity timeline, guest-link details, edit controls, persistent usage through disable/re-enable, and deletion.
- Validation used isolated databases and fake device adapters; no real doors or production records were operated. Tag CI must additionally pass its secret scan and container startup/restart smoke test before publishing images and the GitHub edge manifest.
