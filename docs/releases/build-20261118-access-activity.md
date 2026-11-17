# build-20261118-access-activity

Edge build prepared on 2026-11-18. This annotated build tag publishes `alexmatter/guestin:edge` and immutable build/SHA image tags after CI succeeds. It does not update `latest` or create a GitHub version release.

## Reviewed comparison

- Previous published edge build: **build-20261117-code-timeline** (`e1dddd89b82c869b0bf91eb5af44eb24ed4359ce`), confirmed by the published `update-manifests/edge.json` and its successful tag workflow.
- Reviewed `git log build-20261117-code-timeline..HEAD`, the full corresponding diff, and both unstaged and staged diffs before committing these notes. The comparison includes the existing arrival/departure grouping commit (`f1cfe2c`) and the pending notification, activity and date-navigation changes.
- The preceding stable release remains **v0.4.0**. Earlier changes already published to edge are documented in `build-20261117-code-timeline.md` and its referenced release notes.

## Changes since the preceding edge build

- Open the related access-code page when an approved-access notification is selected. Preserve the protected door-photo thumbnail and existing destinations for door configuration events.
- Limit the access-code detail activity preview to its ten newest events. Show **View all** only when more events exist, linking to a dedicated activity page for that code.
- Keep older-event pagination, localized timestamps, retry handling and live refresh on the full activity page. Support direct links and reloads, and return to the code details with the app's Back button.
- Rename the date shortcut to **Go to today** and hide it when the selected date is already today in the property's timezone. Returning to today follows the current day as time advances. Include the Italian translation.
- Group guest access codes into arriving, staying and leaving sections for the selected calendar date, with translated headings. Staff codes keep their existing list layout.

## Security and compatibility

- No new schema migration, configuration change or breaking API change is introduced after the preceding edge build.
- Existing authentication, property visibility and notification read-state behavior remain in effect. Notification links target an existing code in the event's property; protected door images retain their authentication checks.
- This build updates only the edge channel manifest after Docker publication. Stable update metadata and Docker `latest` remain unchanged.

## Validation

- `bun run check` passed with no Svelte errors or warnings.
- `LOG_FILE=- bun test` passed: **169 tests** across 32 files.
- `bun run build` passed for both applications.
- `bun scripts/staff-codes-smoke.ts` passed, including the ten/eleven-event boundary, full activity pagination, ordering, reloads and Back navigation.
- `bun scripts/notification-history-smoke.ts` passed, including approved-access navigation and protected door thumbnails.
- `LOG_FILE=- bun scripts/mobile-polish-smoke.ts` passed, including conditional date navigation and layouts at widths from 320 to 430 pixels. Updated older test assumptions for the actions menu, notification tabs and local WebSocket setup.
- Validation used isolated databases and fake device adapters; no real doors or production records were operated. Tag CI must additionally pass its secret scan and container startup/restart smoke test before publishing images and the edge manifest.
