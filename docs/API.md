# API reference

All endpoints use JSON under `/api/v1`. Errors return `{error}` with a non-2xx status. Responses use `Cache-Control: no-store`. Write requests require a matching `Origin`; authenticated host writes also require `X-CSRF-Token` from the current session.

## Authentication and team

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/auth/status` | Whether initial setup is needed. |
| POST | `/auth/setup` | Create the first owner with `{setupToken,name,email,password}`. |
| POST | `/auth/login` | Sign in with `{email,password}`. |
| POST | `/auth/accept-invite` | Join with `{invite,name,email,password}`. |
| GET | `/me` | Current user, preferences, and CSRF token. |
| PATCH | `/me/preferences` | Update language, theme, and tour progress for the current user. |
| POST | `/logout` | Sign out. |
| GET | `/users` | Owner-only team list. |
| POST | `/invites` | Owner-only one-use invitation link, valid for 24 hours. |
| DELETE | `/users/:id` | Owner-only removal of a staff member. |

Authentication sets an HttpOnly session cookie. Passwords require at least 12 characters when creating an account.

## Structures and doors

Properties also contain `defaultCheckinLink` and `defaultInstructionsLink`. Owner-only `PATCH /properties/:id/links` updates those HTTP(S) URL defaults; empty strings clear them. They prefill new host forms and do not change existing access codes. Nonempty connector links override the defaults.

- `GET /properties`, `POST /properties`, `PUT /properties/:id`: structure name, IANA timezone, and check-in/check-out defaults. Creation and updates require an owner. Reads include `notificationRetentionMonths` and `breakfastProtected`, never password hashes.
- `PATCH /properties/:id/notifications`: any host can set `{retentionMonths}` from 1 to 120 for the shared structure history. The default is three calendar months; older records are removed automatically. Shortening retention applies immediately.
- `PUT /properties/:id/breakfast-settings`: owner-only `{enabled,password?}`. New passwords require 8–128 characters. Leaving the password unset keeps an existing password; disabling removes protection. Changes invalidate breakfast sessions.
- `GET /doors`, `POST /doors`, `PUT /doors/:id`, `DELETE /doors/:id`: door management. Owners configure `none`, `ewelink`, or `shelly` adapters, credentials, translations, photos, defaults, and enabled state. Secret credentials are omitted from reads.
- `PUT /doors/order`: save order.
- `POST /doors/:id/test`: explicitly confirmed device test, with an idempotency key.
- `POST /doors/:id/resolve-test`: resolve an uncertain test after checking the device.

## Access codes and guest actions

- `GET /codes`, `POST /codes`, `PUT /codes/:id`: codes contain a property, label, optional notes/message links, per-door grants, and an optional breakfast allowance. Each grant has UTC `start`/`end` instants and a `singleUse` setting. Breakfast dates are inclusive property-local dates.
- `POST /codes/:id/revoke`, `POST /codes/:id/regenerate`: revoke or replace a guest link.
- `PATCH /codes/:id/grants/:doorId`: pause/resume one grant with `{active}`.
- `POST /codes/:id/resolve`: resolve an uncertain action with `{doorId,consumed}`.
- `GET /guest`: guest page data, authenticated by the guest token in `Authorization: Bearer …`.
- `POST /guest/doors/:id/open`, `POST /guest/breakfast`: live guest actions, requiring an `Idempotency-Key`. Breakfast input is `{quantity}`.

Guest links keep their token in a URL fragment (`#code=…&page=breakfast`) throughout navigation. The browser never persists the token. `GET /guest` includes a non-secret `codeId` for pending-action idempotency; it cannot authorize requests. Guest requests can include a URL-encoded JSON `X-Oshost-Previous-Visit` header with `{label,date}`. This optional, bounded hint is unverified, recorded only on invalid-link events, and never determines authorization or structure attribution. Device acceptance is recorded separately from physical door state. Ambiguous requests are not retried automatically.

## Breakfast totals

`GET /public/breakfast/:property` returns `property`, `timezone`, `today`, `thisMonth`, `lastMonth`, `from`, `to`, and `total`. Optional `from`/`to` query parameters use `YYYY-MM-DD`. Counts sum confirmed redemption quantities by the redemption date in the structure’s timezone. Unused allowances do not contribute. Responses contain aggregates only.

When protected, anonymous requests return `401` with `{requiresPassword:true,error}`. `POST /public/breakfast/:property/auth` with `{password}` sets a scoped HttpOnly cookie, valid for up to 12 hours. The endpoint is rate-limited. Authenticated hosts can read totals directly.

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
unread counts are independent. The host marks loaded history entries read only
while the page is visible, and also offers **Mark all as read**.

`GET /live` upgrades to a WebSocket using the host session cookie. The request must have an `Origin` matching the configured public origin. The server sends `{type:"sync"}` on connection, `{type:"activity",event}` after committed activity, and `{type:"heartbeat"}` every 25 seconds. Activity uses the same event shape as `/events`; it never includes guest link tokens. Clients reload code/report snapshots after activity and on reconnect, regardless of notification filters. Expired or deleted sessions are disconnected before further delivery. Reverse proxies must forward WebSocket upgrades for `/api/v1/live`.

`code.created` context includes the creator’s `actor` name, `codeLabel`, `validFrom`/`validTo` (the earliest/latest door grant boundaries when present), and the property’s `timezone`. This snapshot is shared by history, in-app alerts, and push notifications in English and Italian.

`GET /events?propertyId=<id>&pageSize=50` returns `{events,nextCursor}`. Pass `cursor` to load older records. Events are shared with the team, scoped to the selected structure; unattributed security events can also appear. `pageSize` accepts 1–100. Legacy calls without pagination return an array. Events may include `context.codeLabel` and unverified `context.previousVisit` metadata. Unknown invalid links appear as unattributed security events; known revoked links remain associated with their structure. Invalid page loads and actions use the `access.invalid` push option, grouped per client for one minute and bounded globally, with suppression summaries.

`GET /reports` returns code creation and lifetime usage counters by code/creator/property. These counters survive notification retention cleanup.

## Connections

`GET /connections`, owner-only `POST /connections` and `DELETE /connections/:id`, and `POST /connections/:id/request` manage KrossBooking, iCal, and AI (Gemini).

Kross bearer tokens are encrypted in the server database, attached by the relay, and never returned to browsers. Passwords are transient. Authentication rejection can invalidate a token; transient network/403/5xx failures retain it. Provider operations and calendar destinations are restricted. Imported data remains a draft until a host saves a code.

## Portable JSON export and restore

- Owner-only `GET /admin/export` downloads an `oshost-json` version 1 document containing properties, door configurations, codes, tokens, grant usage/claims, redemption ledgers, action idempotency records, lifetime counters, retained activity and unresolved door tests. Photos are omitted. The document contains usable credentials and must be protected.
- Owner-only `POST /admin/import` accepts `{backup,confirmation:"RESTORE"}` (maximum 32 MB). Schema, references, device configuration and usage consistency are checked before an atomic restore. Missing records are added; existing IDs retain their current state. Collisions across unrelated records fail and roll back the whole operation. Secrets are encrypted with the destination key, source creator names are preserved, and pending requests become uncertain instead of being retried. No device requests or push deliveries are triggered by import.
- The response reports created and skipped counts for properties, doors and codes. This portable format excludes user accounts, connector credentials and subscriptions; database backups remain the full installation restore option.

## Push and maintenance

- `GET /push/key`: VAPID public key.
- `GET /push/subscriptions`: current user’s subscription IDs and per-device filters; no private subscription keys.
- `POST /push/subscriptions`: `{subscription,properties,events,allProperties?,allEvents?,language?}`. Empty property filters mean all structures for legacy subscriptions. `allProperties:false` uses only selected structures (an empty array receives none). `allEvents:false` uses only the selected event types (an empty array receives none); older subscriptions with empty filters still receive all. `language` is `en` or `it`. Preferences apply to that endpoint only and do not affect shared history.
- `DELETE /push/subscriptions`: `{endpoint}` removes only the current user’s matching device subscription.
- `POST /admin/wipe`: owner-only `{password,confirmation:"WIPE ALL DATA"}` resets the workspace. Back up first.
- `GET /health`: health and database schema version.
