# Guestin build: build-20261110-guestin

Compared with `v0.4.0` (`4e3f0ef`). Build-only update; no GitHub release is created.

- Replace the static breakfast page with a Svelte page using the shadcn range-calendar/date picker, English/Italian text and scoped live WebSocket updates. Existing `/breakfast/<structure>` links redirect to the new page. Password and active-structure checks also apply to open sockets; broadcasts contain refresh signals only.
- Add optional in-page/browser notifications for new breakfast usage while the page is open. They start disabled; browser permission is requested only after explicit opt-in. Reconnection, HTTP refresh fallback and password rotation/expiry are handled.
- Add a workspace-wide date format in Settings → Appearance, managed by owners. Default: `dd/mm/yyyy`; alternatives: `mm/dd/yyyy` and `yyyy-mm-dd`. Apply it to host/guest/breakfast display, editable dates, connector previews, history and push text. Stored dates and API values remain ISO.
- Show breakfast usage as `used/assigned` on access-code list entries, for example `0/4`.
- Rename current app branding, packages, manifests, mail text, browser keys, new JSON files, documentation and Docker publication to Guestin. Continue accepting old backup formats, host/breakfast cookies and existing database paths. Migrate browser preferences and retire old app caches. Historical release notes and the real GitHub repository URL retain their original identifiers.
- Schema 10 adds the date-format setting. Back up the existing database and runtime keys before updating. Existing accounts/data remain intact; workspace wipe restores the date-format default.
- Docker images move to `alexmatter/guestin`. This build publishes `edge`, `sha-<commit>` and `tag-build-20261110-guestin-bad679ea496b`, without moving stable version aliases. Compose defaults to `edge`, overridable with `GUESTIN_IMAGE_TAG`.
- The Compose service is renamed to `guestin`; use `docker compose up -d --remove-orphans` during upgrade so the previous service container does not keep the published port occupied. This does not delete the named data volume.
- Preserve the original Compose volume by default; installations with another volume name must set `GUESTIN_DATA_VOLUME` to that existing volume. With no DB_PATH override, startup detects an existing legacy database before creating `guestin.sqlite`.

Validation: 140 automated tests; TypeScript/Svelte checks; production builds; mobile browser checks for live breakfast updates, optional permission requests/native notification capture, Italian, range selection, date-format propagation and ISO form saving, protected totals/password rotation, mobile layouts, JSON transfers and account recovery. Tests use disposable databases and fake device/mail adapters.
