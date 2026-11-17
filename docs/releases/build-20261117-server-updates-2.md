# build-20261117-server-updates-2

Follow-up edge build prepared on 2026-11-17. Fix the branch-only CI path so skipped publication steps do not attempt to parse missing Docker metadata. The application changes are the same as `build-20261117-server-updates`; the original tag is retained. This is an arbitrary build tag: successful CI updates `alexmatter/guestin:edge` and publishes its immutable build/SHA image tags. It does not update `latest` or create a GitHub version release.

## Reviewed comparison

- Previous published version: **v0.4.0** (`4e3f0ef`). Reviewed `git log v0.4.0..HEAD`, the corresponding source diff, and staged/unstaged changes before tagging.
- Also reviewed `build-20261117-server-updates..HEAD` and the pending workflow/notes diff. The follow-up guards empty metadata in non-publication CI runs; no application behavior changed after the validated worktree merge.
- Integrated the notification/history worktree (`4573`) and structure-settings worktree (`7873`) without modifying their original checkouts. The sections below cover the complete changes since v0.4.0; rebranding, licensing and the initial breakfast/date-format work had already appeared in intermediate build tags.

## Changes

- Add an owner-only **Settings → Server** page. Check `latest` releases by default or select `edge`; display image updates in a popup only on this page, without activity entries, toasts or push notifications.
- Identify the installed server and browser builds. Offer an explicit app refresh that activates a downloaded service worker, preserves the current URL and browser data, and refuses to interrupt other open host windows. Show recovery/reinstallation guidance if the app remains stale after reloading.
- Read channel update manifests from GitHub. CI publishes `edge.json` only after a successful Docker push, and also updates `latest.json` for stable releases. Channel files are committed atomically on a dedicated branch; tag publication is serialized. Runtime checks need no GitHub token or Docker registry credentials.
- Separate shared notification history into **Guest** and **Staff** tabs, with Guest selected initially. Apply category filtering before pagination, and restrict bulk read marking to the selected category. Preserve categories in portable backups and classify older events from their available context.
- Make successful access notifications more concise: show the door in the title and the initiating team member when known. Staff-code interactions and authenticated host actions appear in Staff history.
- Open breakfast pages in a separate tab, including from the embedded demo. Add native sharing, clipboard copying and a selectable-link fallback. Update the landing demo iframe policy to allow the corresponding user-triggered tab.
- Rebrand the application and Docker image as **Guestin**, refresh application icons/favicon assets, and organize installation, user, API and upgrade documentation. The project license is MIT; retained third-party notices continue to apply. Document the beta/pre-1.0 stability policy.
- Add a live, bilingual breakfast partner app with date-range filtering, optional password protection and opt-in browser notifications. Keep original breakfast links working through redirects.
- Add a workspace-wide date format and matching editable date inputs across the host, guest and breakfast apps.
- Provide connected, browser-only landing demos with fictional records, shared host/guest/breakfast state and simulated integrations. Synchronize demo source revisions after passing main CI.

## Security and compatibility

- Server update settings remain owner-only and enforce the existing Origin/session/CSRF protections. Manifest requests validate the schema, channel, source/image repository, commit and digest; missing or invalid metadata yields an unknown status.
- Guest access remains authorized by the guest token and its permissions. A valid host session only attributes the action; invalid cookies and unverified previous-visit hints do not grant access.
- **Schema 10** adds shared date-format settings; **schema 11** adds the installation-wide update channel. Full database backups preserve these settings; portable record backups retain their existing transfer scope.
- Existing legacy database filenames, host/breakfast cookies, browser preferences and portable backup identifiers remain supported. Preserve the existing data volume and runtime encryption keys when upgrading. The Compose service/image names have changed; follow `docs/UPGRADING.md` when migrating an older stack.
- Back up the database, keys and uploaded assets before upgrading. PWA windows opened before the update checker existed need an initial reload to receive it. A channel cannot advertise an update until its first manifest has been published.

## Validation

- Workflow YAML parses with a valid empty-metadata fallback for non-tag runs. The initial main CI run passed container assets/bootstrap/restart persistence before exposing the skipped-step template error fixed here.
- `bun run check` passed with no Svelte errors or warnings.
- `LOG_FILE=- bun test` passed: **163 tests** across 32 files.
- `bun run build` passed for both applications.
- Browser checks passed for structure sharing/settings and notification paging, notification history, door behavior with fake adapters, and Server settings/worker refresh. Fresh standalone and embedded landing demos passed create/edit/reset, guest/breakfast navigation, mobile presentation and no-backend-traffic checks.
- No real door operations or production data were used in validation. Local Docker container validation was unavailable because the Docker daemon was not running; publication CI must pass its container startup/restart smoke test before publishing images and manifests.
