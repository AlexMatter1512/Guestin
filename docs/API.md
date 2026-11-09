# API v1

All endpoints are same-origin JSON under `/api/v1`. Errors return `{ "error": "message" }` with a non-2xx status. Inputs are validated using `shared/schema.ts`. The server applies `Cache-Control: no-store` to API responses. Mutation requests require an `Origin` exactly matching `ORIGIN`.

## Authentication

- `GET /auth/status` → `{needsSetup}`.
- `POST /auth/setup` with `{setupToken,name,email,password}` creates the initial owner once.
- `POST /auth/login` with `{email,password}` signs in.
- `POST /auth/accept-invite` with `{invite,name,email,password}` consumes a one-use staff invitation.
- Successful authentication returns `{user:{id,name,email,role,preferences},csrf}` and sets the HttpOnly, SameSite=Strict `oshost_session` cookie, scoped to `/api/`. It is Secure when the configured origin uses HTTPS. Sessions expire after seven days.
- `GET /me` restores user and CSRF state. Host mutations require `X-CSRF-Token` matching the session. `POST /logout` removes all sessions for that user.
- Owner-only `GET /users`, `DELETE /users/:id` (staff only), and `POST /invites` (returns a 24-hour invitation link).

## Per-user preferences

`GET /me` and successful authentication return `user.preferences`:

```json
{ "tour": "pending", "language": null, "theme": "system" }
```

`PATCH /me/preferences` accepts any subset of `tour` (`pending`, `completed`, `skipped`), `language` (`en`, `it`, or `null`), and `theme` (`light`, `dark`, `system`). It returns `{preferences}`. Each authenticated user can update only their own preferences. Changes are merged with the latest database record; independent concurrent updates do not overwrite unrelated preferences. Defaults apply to accounts without a preferences record. Tour completion or skipping is account-wide and survives browser changes and server restarts. Client caches are not the authority for tour status. An explicit replay can set `tour:"pending"`.

## Properties and doors

All hosts can read `GET /properties` and `GET /doors`. Owner-only creation and updates use `POST /properties`, `PUT /properties/:id`, `POST /doors`, and `PUT /doors/:id`.

Property input: `{name,timezone,checkIn?,checkOut?}`. Timezones use IANA identifiers; defaults are 15:00 and 11:00.

Door input: `{propertyId,name,common,singleUse,integration,config,translations?,enabled?,description?,descriptionTranslations?,photos?,primaryPhotoId?,order?}`. Integrations:

- `none`: `config: {}`. Creates an unconnected door that can be used in code drafts and access codes. Reads return `configured:false`, and guest opening is denied without a device request or grant consumption.
- `ewelink`: `config: {webhook_code}`.
- `shelly`: `config: {host,device_id,api_key}`; host must be a Shelly Cloud hostname.

Secret device configuration is omitted from read responses. An empty config during update retains current credentials for connected integrations. Switching to `none` clears previous encrypted device credentials. Doors cannot move between properties. Translations map language codes to display names. `enabled` defaults to `true`; disabling preserves credentials but denies guest opening and host tests. Descriptions default to an empty string and translated descriptions to `{}`. Existing metadata omitted from a door update is preserved.

Photos are stored directly in SQLite and included in database backups. `photos` accepts up to four `{id,url,alt}` records with unique IDs. `url` must be a PNG, JPEG, or WebP base64 data URL (maximum 1,500,000 characters per image); MIME signatures are checked. SVG and remote URLs are rejected. Clients should resize/compress before uploading. `primaryPhotoId` is `null` or the ID of an included photo; removing a photo means saving the remaining array. Guest responses expose photos/descriptions only for the doors granted to that guest.

Owner-only `PUT /doors/order` takes `{propertyId,doorIds}` containing every current door in that property exactly once and persists its zero-based order. `GET /doors` uses this order. `DELETE /doors/:id` deletes an unused door; a door referenced by any code returns 409 so history remains intact (disable it instead). Pending/uncertain host tests also block deletion.

### Host door tests

Any authenticated host can use `POST /doors/:id/test` with `{confirm:true}` and a UUID `Idempotency-Key`. This sends a real device request without requiring or consuming a guest code. It returns `{id,status,detail}` with status `pending`, `accepted`, `failed`, or `uncertain`. **Accepted means provider-confirmed request acceptance, never proof that the door physically opened.** The client must warn that this can physically unlock the door before submitting.

The same key, door and user return the recorded result; a conflicting key returns 409. A new request for a door with a pending or uncertain test returns 409. No automatic retry is performed. `GET /doors` includes `testAction:{id,status,detail}` for unresolved tests, otherwise `null`, so a refreshed browser can recover its state. `POST /doors/:id/resolve-test` with `{actionId,confirm:true}` acknowledges that a host physically checked an uncertain outcome and permits a subsequent explicit test. Running requests cannot be resolved. Restarted pending requests become uncertain. Activity records include the host and tested door; test requests do not count as guest grant usage.

## Access codes

`GET /codes` returns codes with decrypted guest links for authenticated hosts only, per-door status, breakfast usage, creator ID, `creatorName` (current display name or `null` for a removed creator), and creation time. `POST /codes` creates; `PUT /codes/:id` updates:

```json
{
  "propertyId": "uuid",
  "label": "Guest name",
  "notes": "Internal notes",
  "checkinLink": "",
  "instructionsLink": "",
  "grants": [
    {
      "doorId": "uuid",
      "start": "2026-11-10T14:00:00.000Z",
      "end": "2026-11-12T10:00:00.000Z",
      "singleUse": true,
      "active": true
    }
  ],
  "breakfast": { "total": 4, "start": "2026-11-11", "end": "2026-11-12" }
}
```

Breakfast may be `null`. Selected doors must belong to the code's property and be unique. Allocations cannot be reduced below recorded usage. Pending/uncertain device actions must be resolved before editing grants. Codes cannot move between properties, preserving historical breakfast attribution. Grant responses include `active`, `used`, and `claim`. New grants default to active. An omitted `active` during editing preserves the existing pause state; editing dates or labels must not silently resume access.

- `PATCH /codes/:id/grants/:doorId` with `{active:boolean}` pauses/resumes one door permission without losing usage or affecting other doors/breakfast. An unresolved action blocks changes.
- `POST /codes/:id/revoke`: immediately invalidates the guest link, preserving history.
- `POST /codes/:id/regenerate`: replaces the bearer token; the previous link stops working.
- `POST /codes/:id/resolve` with `{doorId,consumed}` resolves a device claim after physical verification. `consumed:true` increments usage; `false` permits another explicit attempt. A currently executing action cannot be resolved.

## Guest actions

Guest routes require `Authorization: Bearer <guest-token>` instead of a host session. Never put this token in request URLs.

- `GET /guest`: label, property, timezone, door grants/status (including enabled and active flags), descriptions/photos, and breakfast availability. Never returns device credentials or internal notes.
- `POST /guest/doors/:door/open` with `{}` and UUID `Idempotency-Key` → `{status:"accepted"|"failed"|"uncertain"|"pending",detail?}`. Same key and target return the recorded result. A different action using the same key returns 409. Uncertain requests retain a claim; no automatic retry occurs.
- `POST /guest/breakfast` with `{quantity: positiveInteger}` and UUID `Idempotency-Key` → `{remaining}`. Allocation, inclusive property-local dates, and revocation are enforced atomically.

Denied requests use 403; missing/invalid input uses 400; claim conflicts and mismatched idempotency keys use 409. Guest/auth request bursts are rate-limited. Direct connections use the peer address. Set `TRUST_PROXY=1` only behind a reverse proxy that strips and replaces `X-Real-IP`; the proxy must be the only public path to the app.

## Connectors

`GET /connections` returns names, kinds, property IDs, and nonsecret metadata only. Owner-only `POST /connections` accepts `{propertyId,kind,name,secret,data?}`; `DELETE /connections/:id` removes it.

- Kross: `kind:"kross", secret:{}, data:{hotelId:"...",deviceId:"..."}`. Only an optional `token` may be supplied in stored secrets; hotel/device identity are the only accepted client metadata fields. Passwords and verification codes are never stored. Missing device identity is generated on creation. The creation response includes `{id,data}`. Reads expose `data:{hotelId,deviceId,expiry,authenticated}`, with authentication derived from the encrypted token rather than a client-supplied flag.
- Calendar: `kind:"ical", secret:{url:"https://..."}`.
- Gemini: `kind:"gemini", secret:{key:"..."}, data:{model:"gemini-2.5-flash"}`.

`POST /connections/:id/request` dispatches on the saved provider:

- Kross: `{path,body}`. Only allowlisted auth/read paths are forwarded. Login is owner-only. On success, the server retains the returned token and returns only `{authenticated:true,auth_token_expire}`. Challenges return `{authenticated:false,"2fa":boolean,devices:[{"2fa_type", "2fa_id"?, "2fa_device"?}]}`; unrelated provider authentication fields are stripped. A login rejected inside an HTTP 200 payload returns 422 (`KROSS_LOGIN`). An HTTP 401 during OTP verification returns `KROSS_OTP_REJECTED` with safe `providerCode` diagnostics and preserves any existing token. Other HTTP 401 responses clear only the token used by that request, so a delayed rejection cannot erase a newer login (`KROSS_AUTH`). HTTP 403/5xx, invalid JSON and transport errors retain saved tokens, returning 502 with `KROSS_PROVIDER`, `KROSS_RESPONSE` or `KROSS_NETWORK`; `providerStatus` identifies upstream HTTP errors. Plain-text HTTP 403 responses are classified before JSON parsing.
- Calendar: `{}` → `{text}`. Only HTTPS, no userinfo, port 443, no redirects, public DNS addresses pinned for the request, 4 MiB maximum, and a 20-second timeout. Invalid URL/protocol/embedded credentials/private addresses return actionable 400 errors. DNS, download, HTTP, size-limit and timeout failures return safe 502 errors without echoing calendar URLs or embedded credentials.
- Gemini: `{image:base64,mime,prompt}` → `{text}`. Supported MIME types: JPEG, PNG, WebP. The saved API key is injected in a header. Requests and responses are not persisted.

Kross client requests mirror krossApy v5: search uses `{query,page,id_property}`; arrivals use `/app/dashboard-arrivals?page=N` with `{type:"arrivals",page,id_property,date}`; detail uses `{id_reservation,lang}`. Property lists use `data.properties`; search returns `data` plus top-level `has_next_page`; detail uses `data.reservation`. The generated device identity remains local connector metadata. Authentication intentionally matches krossApy’s default body and omits fabricated mobile `device_id`, `deviceName`, and `deviceSystem` fields; live testing confirmed that the earlier added profile reached delivery but rejected valid OTPs. Two-factor delivery sends the selected `2fa_type`, `2fa_id`, and `2fa_device` with the original credentials; completion sends `2fa_type`, string `2fa_code` (preserving leading zeros), and `2fa_trust`.

Only the client converts returned data into drafts. These routes never create codes. Draft mapping recognizes `rooms[].number`/`name_room_type`, `link_guest_portal`/`link_summary`, and `link_check_in_instructions`. Missing or invalid reservation dates leave grants empty for manual review; guest count never implies breakfast allocation.

## Other host endpoints

- `GET/PUT /templates/:property`: language → message kind → template text.
- `GET /events`: latest 1,000 activity records.
- `GET /reports`: code creation/creator and lifetime access attempt/accepted counts. Client groups by property timezone and creation month.
- `GET /push/key` → configured VAPID public key or null.
- `POST /push/subscriptions`: `{subscription:{endpoint,keys:{p256dh,auth}},properties:[],events:[]}`. Empty filters mean all. Browser endpoints are restricted to supported Google, Mozilla, and Apple push hosts.
- `DELETE /push/subscriptions`: removes the current user's subscriptions.

## Public totals

`GET /public/breakfast/:property?from=YYYY-MM-DD&to=YYYY-MM-DD` returns `{property,timezone,today,thisMonth,lastMonth,from,to,total}`. It needs no token or password and exposes only aggregate quantities. The default range is this month through today. Historical totals include revoked codes so revocation does not alter accounting.

`GET /health` returns `{status:"ok",schema:2}`.

## Database wipe and migrations

Owner-only `POST /admin/wipe` requires the authenticated session, CSRF header, matching origin, and `{password:"current owner password",confirmation:"WIPE ALL DATA"}`. The phrase is exact and case-sensitive; the password is verified again. Staff receive 403. Success returns `{ok:true,needsSetup:true}`, removes the session cookie, and invalidates every session and guest link.

The operation deletes **all application records** in one transaction: users, invitations, preferences/tour status, properties, doors and photos, device credentials, access codes, breakfast history, connector secrets, templates, activity, push subscriptions/jobs, and test history. It preserves schema/migration records and application files. **Existing backups, exported files, browser-local drafts on other devices, `.env`, encryption keys, VAPID keys, and `SETUP_TOKEN` are not deleted.** This is an application-data reset, not forensic erasure of storage media. Initial owner setup must be completed again with the existing deployment setup token. There is no undo; take a tested backup before confirming. Clients should clear this browser's saved drafts and signed-in cache on success.

A process-local lifecycle guard covers every API request, including body parsing, password hashing, connector requests and device awaits, plus the entire push delivery batch. A wipe returns 409 while another operation is in flight. No pending operation is cancelled and no automatic unlock retry is introduced. The guard and synchronous transaction prevent a late response from recreating records after deletion. This deployment runs one application process; do not open the same database from a second application server.

Startup applies numbered migrations transactionally. Version 1 creates the core records; version 2 adds `user_preferences`, `grants.active` (existing grants default active), and durable `door_tests`. Existing door JSON receives backwards-compatible read defaults and needs no destructive migration. Startup also changes interrupted device/test requests from pending to uncertain. Back up the SQLite database and encryption keys before upgrades; restoring both preserves credentials, photos, and per-user preferences. Wiping keeps migration version 2 and subsequent startup does not recreate deleted user data.
