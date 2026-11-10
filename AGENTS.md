# Working on guestin

Preserve existing local work. Use isolated databases and fake device adapters in tests; do not operate real doors or alter production data during validation. Run `bun run check`, `LOG_FILE=- bun test`, and `bun run build` for changes affecting the server or apps.

# Producing a release

When asked to produce a new release, inspect the changes since the previous release before writing release notes. Fetch available tags, identify the preceding released version, and review both `git log <previous-tag>..HEAD` and `git diff <previous-tag>..HEAD`. Also inspect unstaged and staged diffs so pending release changes are included. Do not infer the release contents from only the latest commit or from this chat.

Write reviewed notes to `docs/releases/<exact-tag>.md` and include them in the release commit. Describe user-visible changes, fixes, security changes, migrations or breaking changes, and relevant validation. Document the comparison baseline; for an initial release, review the complete tree and say there is no previous release. Honor a requested version, or choose an appropriate next SemVer version. Use an annotated version tag; do not move an existing published tag without explicit authorization.

Every pushed Git tag runs CI and publishes Docker images after successful checks and container smoke tests. SemVer tags (optionally prefixed with `v`) additionally create a GitHub release using the reviewed notes; if no notes file exists, CI uses GitHub-generated notes. Prereleases do not update Docker `latest` or minor-version aliases. Arbitrary tags publish a namespaced, sanitized image tag, a commit SHA tag and the Guestin `edge` alias, without creating a GitHub release.

When committing, pushing and tagging are authorized, include the notes in the commit before pushing the tag. Check the resulting CI, Docker publication and GitHub release before claiming that publication succeeded. Never claim remote publication based only on local checks.
