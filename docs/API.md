# API reference

All endpoints use JSON under `/api/v1`. Errors return `{error}` with a non-2xx status. Responses use `Cache-Control: no-store`. Write requests require a matching `Origin`; authenticated host writes also require `X-CSRF-Token` from the current session.

## Authentication and team

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/auth/status` | Whether initial setup is needed. |
| POST | `/auth/setup` | Create the first owner with `{setupToken,name,email,password}`. |
| POST | `/auth/login` | Sign in with `{email,password}`. |
| POST | `/auth/accept-invite` | Join with `{invite,name,email,password}`. |
| GET | `/me` | Current user, effective permissions, preferences, and CSRF token. |
| PATCH | `/me/preferences` | Update language, theme, and tour progress for the current user. |
| POST | `/logout` | Sign out. |
| POST | `/me/password` | Change own password with `{currentPassword,newPassword}` (12–200 characters). Revokes every session; sign in again. Available to owners and collaborators. Login and password changes share persistent per-account backoff; HTTP 429 includes `Retry-After`. |
| GET | `/users` | Owner-only team list. |
| POST | `/invites` | Owner-only one-use invitation link, valid for 24 hours. |
| PATCH | `/users/:id` | Owner-only update of collaborator `{permissions:{...}}` or promotion with `{role:"owner"}`. |
| DELETE | `/users/:id` | Owner-only deletion with `{confirmation:"DELETE ACCOUNT"}`. Owners may delete collaborators or themselves, never another owner. At least one owner must remain. |

Authentication sets an HttpOnly session cookie. Passwords require at least 12 characters when creating an account.

## Account roles and permissions

Owner and admin refer to the same unrestricted `owner` role. Team accounts use `collaborator`; staff access codes remain a separate concept. New invited collaborators have no permissions until an owner grants them. Existing staff accounts migrate to collaborators with their previous code creation and connector capabilities preserved.

`user.permissions` contains `createAccessCodes`, `createDoors`, `useBookingConnectors`, and `createStaffCodes`. `PATCH /users/:id` accepts a partial permissions object, preserving omitted flags. These are the only grantable permissions; unknown permission keys are rejected. Owners receive every capability regardless of permission storage. Permissions are enforced from the database on every authenticated request and account changes refresh active browsers.

Ordinary and staff code permissions are independent. Each controls creating and managing codes of its type, including updates, revocation, replacement, permission pauses and action resolution. Changing a code's type requires both permissions. `createDoors` permits adding doors, with their initial integration settings; editing, deleting, reordering and testing existing doors remain owner-only. `useBookingConnectors` permits listing and using saved connectors (including iCal/Gemini); credential configuration, Kross login/verification and deletion remain owner-only.

Account management, invitations, property administration, permanent code deletion, backups/import and workspace wiping remain owner-only and cannot be delegated through flags. Owners cannot demote or delete another owner. Promoting a collaborator grants the full owner role. Self-deletion requires another owner, invalidates all account sessions and subscriptions, removes personal preferences/permissions/read receipts, and preserves workspace data and access codes (creator becomes null).

## Structures and doors

Properties also contain `defaultCheckinLink` and `defaultInstructionsLink`. Owner-only `PATCH /properties/:id/links` updates those HTTP(S) URL defaults; empty strings clear them. They prefill new host forms and do not change existing access codes. Nonempty connector links override the defaults.

- Owner-only `PATCH /properties/:id/status` accepts `{active:boolean}`. Inactive structures and their codes, doors, connectors, reports and notifications are hidden; guest links and property-scoped operations return 403 until reactivated. Notification retention pauses for inactive structures. `GET /properties?includeInactive=1` is owner-only and includes archived structures. Legacy structures default to active.
- Owner-only `DELETE /properties/:id` requires `{confirmation:"DELETE STRUCTURE"}` and transactionally deletes related codes, grants, actions, redemptions, counters, events/read receipts/push jobs, doors/tests, connectors, templates and breakfast settings/sessions. Shared users and subscriptions remain; the deleted structure is removed from subscription preferences. Existing backup files are unaffected.
- Owner-only `DELETE /codes/:id` requires `{confirmation:"DELETE CODE"}` and deletes that code, its grants, usage, counters, events/read receipts and push jobs. Other codes and structure settings remain. Deletion and lifecycle changes return 409 while another operation is in flight.
- `GET /properties`, `POST /properties`, `PUT /properties/:id`: structure name, IANA timezone, and check-in/check-out defaults. Creation and updates require an owner. Reads include `notificationRetentionMonths` and `breakfastProtected`, never password hashes. Reads also include `notificationRetentionLimit` (default 1000).
- `PATCH /properties/:id/notifications`: any host can set `{retentionMonths?,maxNotifications?}` for shared structure history (at least one field required). Months range from 1 to 120; the count ranges from 1 to 100,000. Defaults are three calendar months and 1,000 entries per structure. Omitted values are preserved. The oldest entries and associated push jobs, context and read receipts are deleted when either limit is exceeded. Changes apply immediately; lifetime statistics remain. Inactive structures retain their history until reactivated.
- `PUT /properties/:id/breakfast-settings`: owner-only `{enabled,password?}`. New passwords require 8–128 characters. Leaving the password unset keeps an existing password; disabling removes protection. Changes invalidate breakfast sessions.
- `GET /doors`, `POST /doors`, `PUT /doors/:id`, `DELETE /doors/:id`: door management. Owners configure `none` or `webhook` adapters, credentials, translations, photos, defaults, and enabled state. Secret credentials are omitted from list and guest reads. Owner-only `GET /doors/:id/config` returns the saved decrypted configuration as `{config}` with `Cache-Control: no-store`; collaborators cannot read it. Successful door updates emit `door.updated` with the acting username and door reference, without credentials.
- `PUT /doors/order`: save order.
- `POST /doors/:id/test`: owner-only, explicitly confirmed device test, with an idempotency key. Disabled doors can be tested without enabling guest access or consuming a code grant.
- `POST /doors/:id/resolve-test`: resolve an uncertain test after checking the device.

## Email delivery and account recovery

- `GET /auth/status` also reports `smtpConfigured`. Authenticated `GET /mail/status` returns `{configured}`.
- Owner-only `GET`, `PUT` and `DELETE /admin/smtp` manage `{host,port,security,username,password,from,fromName}`. Security is `tls`, `starttls` or `plain`. Reads omit the password and report `hasPassword`; a blank password on save preserves it only when the username and host match. Settings are encrypted with `APP_KEY`. `POST /admin/smtp/test` sends a test message to the current owner.
- Authenticated `POST /me/verify-email` sends a verification link. Public `POST /auth/verify-email` consumes `{token}`. Verification is tied to the account's current email address.
- Public `POST /auth/password-reset-request` accepts `{email,method:"owner"|"email"}` and returns the same acknowledgement for unknown or ineligible accounts. Owner assistance records one pending request and an owner-only `account.reset_requested` notification linking to Team settings. Email recovery requires configured SMTP and a verified address; sends are limited to one per account/purpose per minute.
- Owner-only `POST /users/:id/password-reset-link` returns `{url,expires}` for private sharing and clears the pending request. Public `POST /auth/reset-password` consumes `{token,password}` with a 12–200 character password. Reset and verification links expire after ten minutes, are single-use, and are invalidated by changes to the account email or password. New links replace earlier links of the same kind. A password reset revokes all account sessions and outstanding links.
- User responses include `emailVerified` and `passwordResetRequestedAt`. Collaborators cannot read owner-only reset-request events through history, unread counts, realtime or push delivery.

## Access codes and guest actions

- `GET /codes`, `POST /codes`, `PUT /codes/:id`: codes contain a property, label, optional notes/message links, per-door grants, and an optional breakfast allowance. Each grant has UTC `start`/`end` instants and a `singleUse` setting. Breakfast dates are inclusive property-local dates.
- `POST /codes/:id/revoke`, `POST /codes/:id/regenerate`: revoke or replace a guest link.
- `PATCH /codes/:id/grants/:doorId`: pause/resume one grant with `{active}`.
- `POST /codes/:id/resolve`: resolve an uncertain action with `{doorId,consumed}`.
- `GET /guest`: guest page data, authenticated by the guest token in `Authorization: Bearer …`.
- `POST /guest/doors/:id/open`, `POST /guest/breakfast`: live guest actions, requiring an `Idempotency-Key`. Breakfast input is `{quantity}`.

Guest door actions optionally attribute a valid owner/collaborator login session to `context.actor` in access notifications. Identity comes from the server session, never a guest-supplied username. Missing, expired or invalid host sessions leave ordinary guest access unchanged. The guest token, door enabled state and all grant restrictions still apply, even for logged-in owners.

Guest links keep their token in a URL fragment (`#code=…&page=breakfast`) throughout navigation. The browser never persists the token. `GET /guest` includes a non-secret `codeId` for pending-action idempotency; it cannot authorize requests. Guest requests can include a URL-encoded JSON `X-Guestin-Previous-Visit` header with `{label,date}`. This optional, bounded hint is unverified, recorded only on invalid-link events, and never determines authorization or structure attribution. Device acceptance is recorded separately from physical door state. Ambiguous requests are not retried automatically.

## Shared date display settings

Owner-only `PUT /settings` accepts `{dateFormat:"dd/mm/yyyy"|"mm/dd/yyyy"|"yyyy-mm-dd"}`. Authenticated `GET /settings` and public `GET /public/settings` return `{dateFormat}`. The default is `dd/mm/yyyy`; this is a workspace display preference and does not change ISO API/storage formats. Workspace realtime updates refresh open host and breakfast pages. Schema 10 adds the setting; workspace wipe resets it.

## Breakfast totals

`GET /public/breakfast/:property` returns `property`, `timezone`, `today`, `thisMonth`, `lastMonth`, `from`, `to`, and `total`. Responses also include `date` (the current structure-local ISO date) and the workspace `dateFormat`. Optional `from`/`to` query parameters use `YYYY-MM-DD`. Counts sum confirmed redemption quantities by the redemption date in the structure’s timezone. Unused allowances do not contribute. Responses contain aggregates only.

When protected, anonymous requests return `401` with `{requiresPassword:true,error}`. `POST /public/breakfast/:property/auth` with `{password}` sets a scoped HttpOnly cookie, valid for up to 12 hours. The endpoint is rate-limited. Authenticated hosts can read totals directly.

`GET /public/breakfast/:property/live` upgrades to a WebSocket only for the configured Origin and a viewer allowed to read that structure's totals. Open connections receive only `{type:"sync"}`, `breakfast.changed`, `workspace.changed` and `heartbeat` signals; they must refetch totals with the same authorization. No guest names, access tokens, event context or other structures' redemptions are broadcast. Access is rechecked on every message/heartbeat, and invalid sessions or inactive/deleted structures close with code 1008. Clients reconnect with backoff and retain a periodic HTTP refresh fallback.

## Staff access codes

Codes include `staff` (default `false`). Set `staff:true` when creating or editing
a time-unrestricted door-access link. Staff grants may omit `start` and `end`;
the server stores compatibility bounds, but authorization uses the staff flag
and does not impose a time window. Guest-code grants continue to require and
enforce their dates. Staff codes retain revocation, paused permissions, disabled
doors, single-use consumption, unresolved-action protection, and usage metrics.
This flag grants door access through a link; it does not create a host account.

`GET /guest` includes `staff`, and each door includes `timeUnrestricted` so
clients can omit date restrictions from staff links. Optional breakfast
allowances keep their own dates and quantities. Portable JSON exports preserve
the staff flag and permission usage. Existing codes without the flag remain
dated guest codes.

## Shared history and reports

Notification readers are persisted as `(event_id,user_id,read_at)` receipts.
History entries include `readBy` (reader user IDs) and `read` for the authenticated
user. `GET /events/unread` returns `{total,global,properties}`; property counts
exclude the unattributed events counted in `global`.

`POST /events/read` accepts `{eventIds:[...]}` with 1–100 UUIDs and marks only
those existing events read by the signed-in user. Duplicate reads are idempotent.
`POST /events/read-all` accepts `{propertyId}` to mark that structure and global
events, or `{}` for all structures. Both require the normal session, Origin,
and CSRF checks; clients cannot nominate another reader. Receipts cascade when
events expire or users are deleted. Portable JSON backups omit receipts because
they do not transfer user accounts; full database backups preserve them.

When receipts change, all live sessions for that reader receive
`{type:"notifications.read"}` and refresh their counts/history. Other users'
unread counts are independent. The host marks an entry read when the user clicks it (including toast and push clicks), and also offers **Mark all as read**. Loading, scrolling and background refreshes never mark entries read; read entries are grayed out.

`GET /live` upgrades to a WebSocket using the host session cookie. The request must have an `Origin` matching the configured public origin. The server sends `{type:"sync"}` on connection, `{type:"activity",event}` after committed activity, and `{type:"heartbeat"}` every 25 seconds. Activity uses the same event shape as `/events`; it never includes guest link tokens. Clients reload code/report snapshots after activity and on reconnect, regardless of notification filters. Expired or deleted sessions are disconnected before further delivery. Reverse proxies must forward WebSocket upgrades for `/api/v1/live`.

`code.created` context includes the creator’s `actor` name, `codeLabel`, `validFrom`/`validTo` (the earliest/latest door grant boundaries when present), and the property’s `timezone`. This snapshot is shared by history, in-app alerts, and push notifications in English and Italian.

`GET /events?propertyId=<id>` returns `{events,nextCursor}` with 20 entries by default. Pass `cursor` to load older records. Events are shared with the team, scoped to the selected structure; unattributed security events can also appear. `pageSize` accepts 1–100. All history calls return the paginated envelope. The host app requests 20 at a time and appends older pages automatically near the end of the list. Events may include `context.codeLabel` and unverified `context.previousVisit` metadata. Unknown invalid links appear as unattributed security events; known revoked links remain associated with their structure. Invalid page loads and actions use the `access.invalid` push option, grouped per client for one minute and bounded globally, with suppression summaries.

`GET /reports` returns code creation and lifetime usage counters by code/creator/property. These counters survive notification retention cleanup.

`GET /events/:id` returns one retained notification without marking it read. Event objects include `icon` (`key`, `door`, `danger`, `coffee` or `bell`), `href` (a host code/door page or null), and `thumbnail` (a protected door-photo URL or null). Invalid attempts never have a destination. New door-usage events carry `context.doorId`; older events without a door reference fall back to an icon. `GET /doors/:id/thumbnail` requires a host session and an active structure, and returns the primary photo or first photo. Photos are not embedded in event rows or push payloads. Browser push clicks refresh the destination, mark the event read with normal session/CSRF checks, and focus the app; events without a destination do not change an existing app page.

The count cap applies independently to each structure. Unattributed events use a separate fixed cap of 1,000 entries and three months. Portable JSON backups preserve both structure retention settings; old backups default to 1,000 entries.

## Connections

`GET /connections`, owner-only `POST /connections` and `DELETE /connections/:id`, and `POST /connections/:id/request` manage KrossBooking, iCal, and AI (Gemini).

Kross bearer tokens are encrypted in the server database, attached by the relay, and never returned to browsers. Passwords are transient. Authentication rejection can invalidate a token; transient network/403/5xx failures retain it. Provider operations and calendar destinations are restricted. Imported data remains a draft until a host saves a code.

## Portable JSON export and restore

- Owner-only `GET /admin/export` downloads an `guestin-json` version 1 document containing properties, door configurations, codes, tokens, grant usage/claims, redemption ledgers, action idempotency records, lifetime counters, retained activity and unresolved door tests. Photos are omitted. The document contains usable credentials and must be protected.
- Owner-only `POST /admin/import` accepts `{backup,confirmation:"RESTORE"}` (maximum 32 MB). Schema, references, device configuration and usage consistency are checked before an atomic restore. Missing records are added; existing IDs retain their current state. Collisions across unrelated records fail and roll back the whole operation. Secrets are encrypted with the destination key, source creator names are preserved, and pending requests become uncertain instead of being retried. No device requests or push deliveries are triggered by import.
- The response reports created and skipped counts for properties, doors and codes. This portable format excludes user accounts, connector credentials and subscriptions; database backups remain the full installation restore option.

## Granular JSON transfer (owner/admin only)

`GET /admin/records/doors/export?propertyId=<id>` downloads an `guestin-doors` version-1 document with `{exportedAt,propertyId,doors,doorTests}`. Door records contain `{id,data,config}`, including photos and plaintext webhook credentials. `GET /admin/records/codes/export?propertyId=<id>` downloads `guestin-codes` version 1 with `{exportedAt,propertyId,codes,events}`. Code records use the portable-backup representation, including guest tokens, permissions, consumption, breakfast ledger, actions and counters. Exports include the entire selected structure’s list, not the current calendar/search/status filter. Responses use `Cache-Control: no-store`.

`POST /admin/records/:kind/import` accepts `{propertyId,data,mode?,confirmation?}` for `kind=doors|codes`. `mode` defaults to `append`, adding only missing IDs and skipping existing records. `replace` replaces the whole selected structure’s list and requires `confirmation:"REPLACE DOORS"` or `"REPLACE ACCESS CODES"`. Door replacement updates matching configurations/photos, deletes omitted doors and their grants, and preserves access codes/usage for retained doors. Code replacement deletes all current codes and their related history, then restores the file’s records and history; saved tokens, usage and revocation replace current state. An old file can reactivate access. Empty replacement files intentionally clear the list. Other structures and users are unchanged.

The selected target structure must be active. Source structure IDs are remapped to that target; record IDs are preserved. IDs owned by other structures are rejected. Code permissions must reference doors already present in the target structure; import doors first on another installation. Imports are atomic, limited to 32 MB, require session/Origin/CSRF checks and a current owner session, and return 409 while another operation is in flight. Replacements also reject unresolved device claims/tests. Invalid files, conflicting IDs/tokens or missing references leave all data unchanged. Results report `{added,replaced,removed,skipped}`; active host sessions refresh afterward. Collaborator flags never grant access to these endpoints.

## Push and maintenance

- `GET /push/key`: VAPID public key.
- `GET /push/subscriptions`: current user’s subscription IDs and per-device filters; no private subscription keys.
- `POST /push/subscriptions`: `{subscription,properties,events,allProperties?,allEvents?,language?}`. Empty property filters mean all structures for legacy subscriptions. `allProperties:false` uses only selected structures (an empty array receives none). `allEvents:false` uses only the selected event types (an empty array receives none); older subscriptions with empty filters still receive all. `language` is `en` or `it`. Preferences apply to that endpoint only and do not affect shared history.
- `DELETE /push/subscriptions`: `{endpoint}` removes only the current user’s matching device subscription.
- `POST /admin/wipe`: owner-only `{password,confirmation:"WIPE ALL DATA"}` resets the workspace. Back up first.
- `GET /health`: health and database schema version.

### Generic webhook doors

Use `integration: "webhook"` with a string-valued `config`: `url` (complete HTTP/HTTPS URL, including query parameters), `method` (GET by default; also POST, PUT, PATCH, DELETE, HEAD, OPTIONS), `headers` (a JSON object of string header values), optional raw `body`, and `response_mode` (`http` by default, or `ewelink` for eWeLink JSON acceptance checks). GET and HEAD cannot have a body. Embedded URL credentials and URL fragments are rejected; use an Authorization header. Requests run from the server, so local device URLs must be reachable from the server.

HTTP mode treats any 2xx response as accepted, 4xx as failed, and 5xx or transport errors as uncertain. Acceptance does not confirm physical state. Requests time out after 10 seconds, do not follow redirects, and are never retried automatically. The complete config is encrypted and omitted from door reads. On updates, an empty config keeps the existing request; a nonempty config replaces the complete request.

Existing `ewelink` and `shelly` records are converted transactionally to encrypted webhook configurations at app startup, preserving door IDs, metadata and request behavior. Old portable backups are converted when imported. Subsequent starts leave migrated records untouched. The host form offers editable eWeLink and Shelly Cloud presets; only `webhook` is persisted. eWeLink uses its full URL, GET and `ewelink` response mode.

Shelly Cloud can also use a generic webhook: POST `https://<HOST>/v2/devices/api/set/switch?auth_key=<AUTH_KEY>`, headers `{"Content-Type":"application/json"}`, body `{"id":"<DEVICE_ID>","on":true}`, HTTP response mode. The dedicated Shelly adapter and integration option have been removed. Its preset fills the same generic webhook fields.

The host webhook editor separates headers and query parameters into key/value rows, with another row available only after previous rows are complete. Duplicate header names are rejected case-insensitively; repeated query keys and URL encoding are preserved. API/storage configuration remains unchanged: `config.url` contains the complete URL, and `config.headers` is a JSON object encoded as a string.
