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

Guest links carry their token in a URL fragment. Device acceptance is recorded separately from physical door state. Ambiguous requests are not retried automatically.

## Breakfast totals

`GET /public/breakfast/:property` returns `property`, `timezone`, `today`, `thisMonth`, `lastMonth`, `from`, `to`, and `total`. Optional `from`/`to` query parameters use `YYYY-MM-DD`. Counts sum confirmed redemption quantities by the redemption date in the structure’s timezone. Unused allowances do not contribute. Responses contain aggregates only.

When protected, anonymous requests return `401` with `{requiresPassword:true,error}`. `POST /public/breakfast/:property/auth` with `{password}` sets a scoped HttpOnly cookie, valid for up to 12 hours. The endpoint is rate-limited. Authenticated hosts can read totals directly.

## Shared history and reports

`GET /events?propertyId=<id>&pageSize=50` returns `{events,nextCursor}`. Pass `cursor` to load older records. Events are shared with the team, scoped to the selected structure; unattributed security events can also appear. `pageSize` accepts 1–100. Legacy calls without pagination return an array.

`GET /reports` returns code creation and lifetime usage counters by code/creator/property. These counters survive notification retention cleanup.

## Connections

`GET /connections`, owner-only `POST /connections` and `DELETE /connections/:id`, and `POST /connections/:id/request` manage KrossBooking, iCal, and Gemini.

Kross bearer tokens are encrypted in the server database, attached by the relay, and never returned to browsers. Passwords are transient. Authentication rejection can invalidate a token; transient network/403/5xx failures retain it. Provider operations and calendar destinations are restricted. Imported data remains a draft until a host saves a code.

## Push and maintenance

- `GET /push/key`: VAPID public key.
- `GET /push/subscriptions`: current user’s subscription IDs and per-device filters; no private subscription keys.
- `POST /push/subscriptions`: `{subscription,properties,events}`. Empty filters mean all. Preferences apply to that endpoint only and do not affect shared history.
- `DELETE /push/subscriptions`: `{endpoint}` removes only the current user’s matching device subscription.
- `POST /admin/wipe`: owner-only `{password,confirmation:"WIPE ALL DATA"}` resets the workspace. Back up first.
- `GET /health`: health and database schema version.
