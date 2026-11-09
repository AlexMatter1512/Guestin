# Verification

## Automated checks completed

- Root TypeScript check and Svelte checks for both PWAs: no errors or warnings.
- Both static PWA production builds.
- 36 Bun tests with 334 assertions: manual creation without connectors or booking tables; single-use and concurrent device claims; duplicate requests; uncertain results and host resolution; concurrent breakfast redemptions and allocation floors; revocation and token replacement; owner/staff authorization; origin enforcement; aggregate-only public responses; encrypted credential fields; property-local dates and DST; iCal recurrence, exclusive dates and timezone identifiers; two-factor request construction; provider relay allowlisting and 401 versus transient errors; malformed extraction; blocked calendar destinations; bounded push retries and expired-subscription cleanup; migrations, restart recovery, and backup restoration including encryption keys.
- Headless Google Chrome smoke: first-run setup, property and door creation, manual code creation, guest breakfast redemption, separate service-worker scopes, offline draft restoration, and 390px mobile layout. No JavaScript page errors. Desktop host/guest screenshots visually inspected.

Tests inject fake device results or mock provider transport. No real unlocks, notification messages, Gemini requests, or authenticated Kross requests were performed.

## Checks requiring the deployment environment

- Docker build/run/restart has not been executed: the local Docker daemon was stopped. The application itself, database restart recovery, and static production output were tested outside Docker.
- Install both PWAs and test notifications on actual iOS and Android devices. The automated browser test validates scopes, but cannot establish real mobile OS installation or push delivery.
- Kross login, email two-factor completion and a properties read have been verified live with the user-authorized account. Validate reservation response shapes, pagination and privileges for deployment. The API is unofficial; raw read responses can be inspected within the connector screen. Always review imported drafts.
- Validate actual eWeLink scenes and Shelly devices, including momentary relay configuration. Shelly Cloud v2 uses HTTP 200 as provider acceptance, not proof that a door physically opened.
- Validate an actual calendar URL and your Gemini account/model. Calendar DNS pinning and URL rejection are implemented; public external calendar retrieval was not exercised against a customer feed.
- Select project licensing and review source/dependency notices before public release.

## Host navigation and onboarding update

The host uses compact GuestIn-inspired bottom navigation with a central create action. Doors has its own list and add/edit view; Messages, Connectors, and Reports are reached from Settings.

Guided setup is interactive: the next real navigation control or form is highlighted, and progression follows successful property/door/code saves. It does not create records automatically or advance with Next buttons. The example door starts without a device connector and is disabled for guest opening until connected. Skip remains available throughout and retains entered data. Completion/dismissal is stored per user in SQLite (`user_preferences.tour`: pending/completed/skipped); browser-local tour markers no longer control it. Migration v2 initializes existing accounts as pending. The spotlight dims the surrounding page while the real target and Skip control remain usable. Replay reuses existing setup records and preserves current drafts.

The isolated `scripts/onboarding-smoke.ts` covers highlighted controls, actual first property/example-door/access-code creation, validation, mid-form Skip/replay, dismissal after reload, existing-record reuse, and mobile layout. The generic browser smoke covers the rest of the host/guest workflow. No real provider calls or unlocks are used.

## Host language selection

Host guided setup now has an explicit English / Italiano choice before the initial tour. The preference is stored per user in SQLite; a browser copy supports offline draft display. Theme and tour status also follow the account across browsers. Core host navigation, setup forms, tour instructions, and controls follow that preference; guest language remains independent. Raw provider/server error messages may fall back to English.

Users whose database tour status is completed or skipped are not automatically returned to onboarding just because no language was previously chosen. They can choose a language in Settings or explicitly replay the tour to see the chooser. Selecting “Skip tour / Salta il tour” still saves the chosen language and dismisses onboarding without creating any records.

Verified with `scripts/language-smoke.ts`: the guide is absent until explicit confirmation; only English/Italiano are offered; Italian property → example door → access-code setup works; reload preserves language; Settings can switch back to English; and completed-tour users with no stored language are not forced back into setup. Both existing browser smoke scripts still pass after explicitly choosing English. Root TypeScript/Svelte checks have zero errors/warnings, all 36 API/unit tests pass, and the host production build passes.

## Host feature verification

- `scripts/door-features-smoke.ts`: descriptions/translations/photos, gallery/primary image, disable/filter, ordering save/reload, explicit test cancel, injected uncertain/accepted outcomes and resolution, deletion, mobile layout.
- `scripts/guest-doors-smoke.ts`: five-language door states, paused/disabled permissions, translated descriptions, primary photo/gallery and language-aware links. No unlocks.
- `scripts/spotlight-smoke.ts`: target alignment during scroll/resize, clickable target and Skip, mobile forms, cleanup, dark-mode text contrast and system theme changes.
- `scripts/host-features-smoke.ts`: detail/edit URLs and browser history, permission pause preserved through edits, date/status UI, language-aware sharing, template placeholders/preview/reset, persistent theme, profile, quick-create, guarded database wipe in a disposable database, and account/draft regressions.
- API regression tests cover per-user persistence, owner/staff access, preserved paused/disabled permissions, photo validation, idempotent host tests, unresolved claims, and wiping only with the exact confirmation/current password while no device/provider/notification operation is in flight.

All wipe verification uses temporary SQLite databases. Production data is not reset. Database migration v2 is additive, preserves existing records, and runs automatically on startup. Photos are stored inside SQLite and included in the existing database backup/restore procedure.

## GuestIn web UI and broken-flow repairs

The host now adapts GuestIn's neutral design tokens, header/footer, compact rows, creation sheet and focused settings pages. No Capacitor dependency is used. Source provenance and the GuestIn license are recorded separately.

- `scripts/redesign-smoke.ts` runs the real UI on an insecure HTTP hostname, verifies exact raw-code/full-link copying, denial/manual fallback, standalone Settings pages, mobile overflow and desktop/mobile appearance.
- `scripts/clipboard-smoke.ts` exercises missing/denied Clipboard API, native-modal focus and HTTP-safe UUID behavior; no operating-system clipboard secrets are used.
- `scripts/connector-ui-smoke.ts` exercises the real API relay with intercepted provider fixtures: automatic Kross setup, two-factor send/verify, property selection, `query` search, pagination, detail mapping, saved-session reopening, transient 403 retention versus expired 401, iCal upload and malformed/cancelled Gemini extraction. No access code is automatically saved.
- Existing onboarding, language, spotlight, door management, host feature and PWA/offline tests have been updated to the focused routes and passed. Spotlight contrast measurement converts the new oklch design tokens to sRGB before WCAG calculation.

Kross reservation mapping uses current local krossApy v5/BnBScraper fixtures. Live login, email OTP and a properties read were subsequently verified with the user-authorized account through the corrected TypeScript client and real oshost relay; reservation listings and details still use fixtures. Actual device unlocks and external notification delivery remain excluded from automated tests.

## Kross OTP request comparison

The live krossApy default flow successfully verified an email OTP with the same supplied account that oshost’s previous mobile-profile payload rejected. oshost now sends the same default authentication fields (`hotel_id`, `username`, transient `password`, app API identifier, `with_priv`, `app`, `type`) and the appropriate two-factor fields. A stable connector identity is retained locally; fabricated mobile device profile fields are omitted from authentication. Credentials and OTPs are excluded from source, fixtures and logs. Fixture assertions now reject the former additional device fields so the mismatch cannot silently return.

Live confirmation: the corrected TypeScript client authenticated through oshost’s real relay and retrieved one property. This check used an isolated in-memory database; no password or OTP was persisted and temporary authentication sessions were closed afterward. Full regression result: 41 tests, 382 assertions; TypeScript/Svelte checks, host production build and connector UI smoke passed.

## Original BnB guest frontend parity

The guest UI copies the original `BnB_Server_Bot/BnBFrontend` Tailwind markup and image assets directly: guest/date header, five-language flag menu, sticky gradient tabs, door cards and warnings, breakfast amount controls, confirmation/feedback dialogs and usage-period state. Application scripts use oshost API tokens, per-door grants, independent breakfast dates and property-local time.

`scripts/guest-parity-smoke.ts` renders a disposable copy of the untouched original frontend and oshost with identical fixtures. It compares header/navigation/main/title/image/action geometry and computed styles at 390px and 1100px, with screenshots of both doors and breakfast. Required safety differences remain: device acceptance is not presented as physical opening, ambiguous unlocks cannot automatically retry, and disabled/paused/unconnected doors stay unavailable. Tests never call real devices.

`scripts/bnb-breakfast-smoke.ts` verifies increment/decrement/Clear/Max, explicit confirmation and cancellation, one ledger write after confirmation, final-credit success popup, depleted state, inclusive independent dates and mobile dialog sizing. Existing guest gallery/state and full PWA/offline tests use the restored original interactions.
