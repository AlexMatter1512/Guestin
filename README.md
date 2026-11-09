# oshost

Self-hosted guest access: a host PWA, a guest PWA, and a public breakfast totals page, served by one Bun application with SQLite.

**An access code is the central record.** There are no persisted bookings, booking synchronization jobs, or automatic code creation. KrossBooking, iCal, and optional Gemini screenshot extraction prepare a draft for a host to review.

## Run locally

Requires Bun 1.4+. From the project root:

```sh
bun install --frozen-lockfile
bun scripts/init-env.ts
bun run build
bun start
```

Open `http://localhost:3000/host/`. Use the `SETUP_TOKEN` from your local `.env` to create the first owner. The setup route closes once an owner exists. Passwords require 12 characters. Add a property in **Settings → Properties** and connect its doors in Doors, then create an access code. Before the initial guided setup, choose **Italiano** or **English** and confirm. This choice, theme preference, and tour completion/skip status are saved per user in SQLite and follow the account across devices. Language is changed under **Settings → App language** and theme under **Settings → Appearance**; guest language is independent. Interactive guided setup then starts: click the highlighted controls while the rest of the page is dimmed to create a property, an example door, and an access code. You can skip at any time or replay it with the ? button or App tour in Settings. Existing properties and doors are reused on replay; saves create real records, never automatic demo data. Owners can copy one-use staff invitation links; invitations expire after 24 hours.

Bun automatically reads `.env`. Keep it private and retain its `APP_KEY`: losing that key makes stored guest links and integration credentials unrecoverable. The initialization command refuses to overwrite an existing `.env`.

## Docker

```sh
docker compose up --build -d
```

Compose binds port 3000 to localhost for use behind an HTTPS reverse proxy, and stores SQLite in the `oshost-data` named volume. Set `ORIGIN` in `.env` to the exact public origin (scheme, hostname, and optional port). Forward `/` to the application without stripping paths. No separate database service is required.

Example Caddy configuration:

```caddyfile
access.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

For direct TLS, set `TLS_CERT` and `TLS_KEY` to certificate/key file paths visible inside the container, mount them read-only, expose the chosen port, and set `ORIGIN` to its HTTPS origin. TLS file paths are optional; do not set only one. HTTPS is necessary for PWA installation and push outside localhost.

## Applications

- `/host/`: code management, per-door access rules, breakfast allocation, shared connectors, templates, reports, activity, and settings.
- `/guest/#code=...`: guest link. Tokens use URL fragments so they do not reach request/access logs; the guest app sends the token in an Authorization header and keeps it in session storage.
- `/breakfast/<property-id>`: public aggregate totals only. Settings → Breakfast totals provides the link.
- `/api/v1/health`: health and schema version.

Doors can initially use **Connect later (example door)** without device credentials. Add a device connector later by editing the door in Doors. Unconnected doors remain unavailable in the guest app and cannot send unlock requests; their grants are not consumed.

Room grants can be single-use independently of other doors and breakfast. A failed provider response permits another explicit attempt. An uncertain response (including an interrupted request during restart) requires a host to verify the door and resolve the claim. Neither cloud adapter confirms physical door state. Configure the device or scene for the appropriate momentary unlock behavior.

Unfinished new-code drafts stay on the host device. Active codes and host records are loaded from the server; mutations require a live connection. Service workers cache only application assets and the empty application shell. Each PWA has its own scope and caches.

## Connections

Create a property-scoped shared connection as an owner:

- **KrossBooking:** save a named connection, then enter hotel ID, username, and password in the connector panel. Complete two-factor verification when requested. The password is forwarded only for login; only the resulting token is encrypted in SQLite. Select a Kross property, retrieve arrivals by date/page or search, and select a reservation to initialize a draft. Verify room mapping and dates before saving. Raw provider responses are visible in the session to help diagnose API shape changes.
- **iCal:** upload an `.ics` file or save an HTTPS calendar URL. Select the door described by that calendar. Events are parsed on the client, with a one-year expansion horizon and a 200-draft cap. All-day DTEND is treated as the departure date (the calendar's exclusive end). Missing guest details must be entered manually. Calendar redirects and private/reserved addresses are blocked; DNS is pinned for the actual fetch.
- **Gemini:** save an API key and model (default `gemini-2.5-flash`). The client resizes screenshots before sending them to Gemini through the server. Images and extraction responses are not stored by oshost. Review all extracted fields; unavailable values remain empty. Google may charge for requests and apply its own data policies.

Shared tokens, keys, calendar URLs, and device credentials use AES-256-GCM encryption. Hosts can use shared connections without retrieving the stored credentials. No background provider polling occurs.

## Notifications

`scripts/init-env.ts` creates VAPID keys. Set `VAPID_SUBJECT` to a contact email URI such as `mailto:admin@example.com`. Each host device enables push in Settings → Notifications and can filter properties and event types. Empty filters mean all events. iPhone/iPad users must first add the host PWA to the Home Screen. Denying notifications leaves the activity feed available.

Delivery jobs are persisted in SQLite, retried at most five times, and discarded for expired subscriptions. Browser notifications use event IDs as tags. Push delivery is best effort and does not affect device actions or breakfast accounting. The server requires outbound HTTPS access to the relevant browser push services.

## Backups and restore

```sh
bun scripts/backup.ts /absolute/private/backup-directory
# Docker: writes a backup into the persistent volume, then copy it to secure storage
# docker compose exec oshost bun scripts/backup.ts /app/data/backup-YYYY-MM-DD
```

The backup includes a consistent SQLite snapshot, any `data/assets`, and `secrets.json` with encryption and VAPID keys. Protect the entire backup as sensitive data. To restore: stop oshost, place `oshost.sqlite` at `DB_PATH`, restore assets, copy the saved keys into `.env`, remove stale SQLite `-wal`/`-shm` sidecars only while stopped, and start oshost. Existing session expiries still apply. The setup token can be regenerated after setup; keep the encryption key unchanged.

## Host controls and database reset

The web UI follows GuestIn: neutral light/dark themes, a fixed header and bottom navigation, compact lists, a creation sheet, and focused Settings pages. Door/code management lives in detail screens. No Capacitor/native runtime is required.

**Settings → Connectors → KrossBooking** provides hotel ID, username and password sign-in followed by two-factor delivery/verification if requested. Connection records are created automatically and saved server-side without passwords. Existing sessions restore on reopening. Search, property selection and pagination use the current krossApy v5 response shapes; selecting a reservation only opens a draft. Calendar and image imports have separate screens and typed fields.

Copy code/link/message works on HTTP LAN testing through a synchronous clipboard fallback. If browser policy denies copying, a selectable-text dialog explains how to copy manually. Operational actions use a cryptographically secure UUID fallback where `crypto.randomUUID` is unavailable on HTTP. HTTPS is still required for PWA installation/service workers and push on non-localhost origins.


Doors supports confirmed host tests, enable/disable, descriptions and translations, photos with a primary image, and drag or keyboard ordering with Save/Cancel. Tests send a real device request: provider acceptance is not proof of physical opening. An uncertain result blocks further tests until a host explicitly confirms checking the door. Delete is available for unused doors; disable doors referenced by codes to preserve their history.

Code cards show validity and door badges, with date/status filters, a detailed permission/usage view, pause/resume per door, duplicate warnings, direct guest-page links, and language-aware message preparation. Messages includes placeholder insertion, live previews, and reset-to-default. The central + offers a code or door; the account button opens your profile. Views and record details have bookmarkable hash URLs and support browser Back/Forward. Settings offers Light, Dark, and System themes.

**Settings → Data management → Wipe database** is owner-only. It requires the current password, an explicit data-loss acknowledgment and the exact text `WIPE ALL DATA`. It deletes the entire team's database records, including users, sessions, photos, connector credentials, guest links, breakfast history and notification subscriptions. It cannot be undone without a backup. Back up first and retain the server's setup token: after a wipe, create a new owner through setup. The server rejects a wipe while other operations are in flight. Server configuration, encryption keys and existing backup files remain on disk; this is a logical reset, not secure media erasure. The application does not wipe anything during startup or migration.

## Development and verification

```sh
bun run check
bun test
bun run build
bun scripts/browser-smoke.ts
bun scripts/onboarding-smoke.ts
bun scripts/language-smoke.ts
bun scripts/spotlight-smoke.ts
bun scripts/door-features-smoke.ts
bun scripts/guest-doors-smoke.ts
bun scripts/guest-parity-smoke.ts
bun scripts/bnb-breakfast-smoke.ts
bun scripts/host-features-smoke.ts
bun scripts/clipboard-smoke.ts
bun scripts/redesign-smoke.ts
bun scripts/connector-ui-smoke.ts
```

The browser smoke test uses installed Google Chrome and an isolated temporary database. It never triggers a real door or external provider. API tests inject fake device adapters. Production adapters always call the configured real provider: do not use guest door buttons for casual testing against real door configurations.

For UI hot reload, run a PWA's `dev` script with the server running and set `ORIGIN` to that Vite origin; restore the deployment origin afterward. Production serves built PWAs directly.

See [API documentation](docs/API.md), [source provenance](docs/PROVENANCE.md), and [verification notes](docs/VERIFICATION.md). Project licensing is deferred; public release needs that decision and a review of reused material.

## Backend logs

The server writes structured JSON lines to stdout and `data/logs/server.jsonl`. Every line includes an ISO 8601 UTC timestamp with milliseconds, severity and event name. API requests get a server-generated `X-Request-ID` response header; completion records include that ID, method, normalized route, HTTP status, elapsed milliseconds, client IP, and the authenticated user's ID, name and role when available. Anonymous and rejected sign-ins remain distinguishable from authenticated activity. Concurrent requests keep separate user contexts.

Logs cover sign-ins/session rejection, access-code activity and safe resource IDs, premature/expired/denied guest access, accepted/failed/uncertain device requests, provider HTTP responses, push delivery/retries/removal, unexpected exception class/stack frames, startup and shutdown. Kross/provider code can add safe operation/result fields to the same request context. Request bodies, raw URLs/query strings, guest tokens, passwords, OTPs, authorization/cookie headers, connector credentials and provider response bodies are never logged. Exception messages are excluded because external errors can embed secrets.

Configuration:

- `LOG_LEVEL=debug|info|warn|error` (default `info`; `debug` also logs request starts).
- `LOG_FILE=data/logs/server.jsonl`; set `LOG_FILE=-` for stdout only.
- `LOG_MAX_BYTES=10485760` (10 MiB per file by default).
- `LOG_ROTATIONS=5` keeps five older files (`.1` through `.5`), plus the current file.

Use `tail -f data/logs/server.jsonl` during local testing, or collect container stdout through your deployment's log collector. New log directories/files use owner-only permissions. Log sink failures do not change API or door-action outcomes. Logs are separate from SQLite and remain after database reset; remove/rotate them separately when clearing diagnostics. Keep the configured log directory on a persistent volume if using a custom container path.

## GitHub Actions and Docker Hub

`.github/workflows/docker.yml` runs frozen-lockfile installation, type checks, tests, and a Docker build for pull requests to `main`. The packaged container is started against a disposable volume, checked for both PWAs and SQLite access, then restarted to verify persistence. No real device/provider calls are made.

Pushes to `main` publish `alexmatter/oshost:latest`, `:main`, and `:sha-<full-commit>`. Version tags such as `v1.2.3` also publish `:1.2.3` and `:1.2`. Images support `linux/amd64` and `linux/arm64`. Manual workflow runs publish only from `main` or a `v*` tag; pull requests never use registry credentials or publish images.

Configure this repository in GitHub **Settings → Secrets and variables → Actions**:

- Actions variable `DOCKERHUB_USERNAME`: `alexmatter`.
- Actions secret `DOCKERHUB_TOKEN`: a Docker Hub access token with write permission for the `alexmatter/oshost` repository. Never commit it or put it in the image.
- Optional Actions variable `DOCKERHUB_IMAGE`: another lowercase `namespace/image`; defaults to `<DOCKERHUB_USERNAME>/oshost`.

Create `alexmatter/oshost` on Docker Hub if it does not already exist. Publication fails with a configuration message until the variable and token are set. After adding them, rerun the workflow from GitHub Actions. For the published image, replace `build: .` in your Compose service with `image: alexmatter/oshost:latest`; keep the existing `.env` and database volume.

To run the same disposable image check locally: `bash scripts/container-smoke.sh oshost:ci` after building with `docker build -t oshost:ci .`.
