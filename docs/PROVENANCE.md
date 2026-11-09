# Source provenance

Project licensing is intentionally undecided. No project-wide license grant is made yet.

- `apps/guest/src/lib/i18n/{en,it,fr,es,de}.json` were copied from the local BnB_Server_Bot/BnBFrontend source. No license file was present at its repository root during implementation. Verify permission and licensing before public release.
- Guest layout, door cards, breakfast selector/confirmation/feedback markup, `ErrorScreen`, translation/state helpers, Tailwind styles, `favicon.png`, `default_door.png` and `doors_images/*.png` are copied/adapted directly from local `BnB_Server_Bot/BnBFrontend`. Source visual classes and assets are preserved; scripts are adapted for oshost's access-code API, independent breakfast allowance dates, property timezones and safe device outcomes. The source repository remains untouched. No source license file was present; public release still requires the later licensing review.
- KrossBooking endpoint behavior follows local krossApy v5 source. No Python implementation was copied into the new project. The provider API is unofficial and can change.
- GuestIn (AGPL-3.0) host web UI is now the visual and structural source: the neutral design tokens and theme CSS are adapted from `HostApp/src/app.css`; the fixed header/footer, settings rows, compact code list and creation sheet follow its web components. Capacitor/native dependencies are excluded. The original license is retained at `docs/licenses/GuestIn-LICENSE`. Public release must respect this reused-source license; the project-wide licensing decision remains deferred.
- Device integration behavior was studied in GuestIn; adapters are new TypeScript implementations.
- The host Button was generated with shadcn-svelte 1.8.0 (nova style). Its MIT notice is preserved in `docs/licenses/shadcn-svelte-LICENSE.md`. Other controls use semantic native form elements and project styles.
- Dependency licenses remain those of their respective packages. Run a dependency license review before selecting the project license and publishing.

Provider references used to validate the new adapters:
- [Shelly Cloud v2 control](https://shelly-api-docs.shelly.cloud/cloud-control-api/communication-v2/): upstream authentication uses `auth_key` in the HTTPS query and HTTP 200 indicates command acceptance. oshost never exposes or logs that upstream URL. This provider-required transport is an exception to keeping credentials out of application URLs.
