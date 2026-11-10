# Self-hosting guestin

For the quickest start, use the [README](../README.md). The same [Compose file](../compose.yaml) works with Docker Compose and Portainer.

## Configuration

Edit the values in the Compose `environment` section before deploying:

| Setting | Purpose |
| --- | --- |
| `ORIGIN` | Exact public HTTPS address, such as `https://stay.example.com`. |
| `VAPID_SUBJECT` | Contact address for push notifications, such as `mailto:you@example.com`. |
| `DB_PATH` | SQLite location; keep `/app/data/guestin.sqlite` when using the supplied volume. |
| `TRUST_PROXY` | Enable only when your reverse proxy overwrites `X-Real-IP`. |
| `LOG_LEVEL` | `info` by default; use `debug` temporarily for troubleshooting. |
| `LOG_FILE` | Log file in the data volume; `-` writes only to container stdout. |

First startup creates `/app/data/runtime-secrets.json` containing encryption, setup, and push keys. The initial setup token appears in container logs until the first owner exists. Keep the data volume and keys when updating the stack.

Existing installations without `runtime-secrets.json` should supply their original `APP_KEY`, `SETUP_TOKEN`, `VAPID_PUBLIC_KEY`, and `VAPID_PRIVATE_KEY` once. Startup adopts those keys into the volume. It refuses to replace a missing encryption key for an existing database.

## HTTPS

The host port is `127.0.0.1:38471`. Point your domain at the server and configure a reverse proxy. For Caddy running directly on the server:

```caddyfile
stay.example.com {
  reverse_proxy 127.0.0.1:38471 {
    header_up X-Real-IP {remote_host}
  }
}
```

Allow ports 80 and 443. A proxy on the same Docker network can use `guestin:3000`. Forward paths unchanged and allow WebSocket upgrades on `/api/v1/live` (Caddy does this automatically). HTTPS is required for public deployments, as well as phone installation and push notifications. The supplied Compose file enables `TRUST_PROXY=1`: the proxy must overwrite `X-Real-IP` with the actual connecting client address, as above. Never forward a client-supplied value. For nginx use `proxy_set_header X-Real-IP $remote_addr;`. Restrict backend access to the proxy. Set `TRUST_PROXY=0` when serving clients directly; forwarded headers are then ignored.

For direct TLS, mount your certificates read-only and set both `TLS_CERT` and `TLS_KEY` to their paths inside the container. Set `ORIGIN` to the resulting HTTPS address.

## Guest and staff access codes

Guest codes use the calendar and each door's validity dates. **Filters → Non
revoked** includes codes that have not been revoked, independently of whether
their dates are current, upcoming or expired on the selected calendar day.

Enable **Staff access code** in the code form for cleaning, laundry or other
recurring staff. Selected doors have no start or end date. Switch **Staff codes**
on the list page to see these codes without a calendar. This view defaults to
non-revoked codes; its filters can show revoked codes or all staff codes. Search,
usage counts, sharing, editing, pausing permissions and revocation remain available.
Creating a code from this view enables the staff flag by default.

Single-use rules, disabled doors and unresolved device requests still apply.
An optional breakfast allowance keeps its own date and quantity limits. Editing
or changing a code's kind preserves recorded usage; changing back to a guest
code exposes its validity fields again. Portable backups preserve the staff flag.

## Connections

Owners configure connections in Settings. KrossBooking bearer tokens, calendar URLs, Gemini keys, and door credentials are stored encrypted in SQLite. The server attaches provider credentials to requests; staff browsers cannot read them. Kross passwords are used only during sign-in and are never saved.

Connectors prepare drafts for review. They do not synchronize bookings or create access codes automatically.

## Notifications

The host bell shows the signed-in user's unread count across structures.
Reading the loaded history marks those entries read on that user's other
devices; it does not clear another team member's badge. **Mark all as read**
applies to the selected structure and unattributed events. Read receipts survive
restarts and are removed with expired history or deleted users.

In-app activity and transient success messages use shadcn Sonner. They follow
the host's light/dark setting and device notification filters independently of
read status. With one structure, the header shows its name directly; additional
structures enable the selector.

Notification history belongs to the structure and is shared with the team. Its default retention is three calendar months, adjustable from 1 to 120 months in Settings → Notifications. Cleanup runs automatically; shortening retention removes older entries. Reports retain lifetime totals independently of this history.

Push selection is local to each device, with delivery preferences attached to that device’s server subscription. Disabling push on one device does not disable another. iPhone/iPad push requires opening the installed Home Screen app.

Invalid guest links are always rejected. To bound database writes and push jobs,
each one-minute window records at most one unknown-link alert per client and
one per revoked code, with at most three alerts per client and twenty globally.
Changing a random token does not create a new alert. The next invalid request
after the window ends records one summary of suppressed attempts, counted
against the new global budget. Summaries have no guest or property attribution;
normal valid-link activity is unaffected. These in-memory budgets reset on restart.

Password hashing and verification share two execution slots and four waiting
slots per installation process. Excess work receives HTTP 429; retry shortly.
Invalid setup and invite tokens are rejected before hashing, and eligibility is
rechecked after waiting and when the user is committed.

Login and password changes share a persistent account budget, independent of client IP. Five attempts are allowed initially; subsequent attempts require a 30-second delay, doubling to a maximum of 15 minutes. Rejected attempts during a delay do not extend it. HTTP 429 includes `Retry-After`. Successful authentication clears the budget; inactive records expire after 24 hours. The budget stores email digests for registered accounts only, so random nonexistent emails cannot fill a global lockout budget. Guest and authentication routes have separate per-IP limits of 100 requests per minute.

Open **Your account → Change password** to rotate a password. Enter the current password and a different new password of 12–200 characters. All sessions are revoked, including the current one; sign in again on every device. This flow is available to owners and collaborators.

## Breakfast page

Settings → Breakfast provides a direct link and optional password protection. Owners can set, change, or remove the password. Signed-in hosts can open the page directly. Other viewers enter the shared password and stay signed in for up to 12 hours. Changing the password invalidates existing breakfast sessions. The page supports English/Italian, live WebSocket updates, optional notifications while open, and a shadcn date-range picker. Owners select the shared date format under Settings → Appearance; the default is `dd/mm/yyyy`. Existing `/breakfast/<structure>` URLs keep working. The page and API count breakfasts actually used, using confirmed redemptions rather than assigned allowances. They expose aggregate totals only.

## Backups

For a portable export, open **Settings → Data management → Download JSON backup**. Upload the file in the same section to preview and restore it (up to 32 MB). Confirmation requires the trust switch and typing `RESTORE`. Existing IDs are left unchanged; an old file cannot rewind current usage or revocations. Guest tokens are preserved, while links use the destination server’s address. Images are omitted. Device credentials are re-encrypted with the destination key. User accounts, push subscriptions and booking connector credentials are not transferred. Pending device requests remain uncertain and blocked until an owner checks and resolves them.

JSON files contain guest tokens and device credentials in readable form. Keep them private and import only trusted files. For a full installation backup, including images, accounts, connector credentials and encryption keys, use the database backup below.

From the stack directory:

```sh
docker compose exec guestin bun scripts/backup.ts /app/data/backup-2026-11-09
docker compose cp guestin:/app/data/backup-2026-11-09 ./backup-2026-11-09
```

Choose a fresh backup directory each time. In Portainer, run the same Bun command from the container console, then copy the resulting directory to secure storage.

A backup contains the database, runtime keys, and uploaded assets. Protect it as sensitive data. To restore, stop guestin, replace the database and assets, and put `runtime-secrets.json` beside the restored database. Remove stale SQLite `-wal`/`-shm` files only while stopped, then restart the app. Older backups can provide their original keys through the environment for the first start.

## Updates and releases

Back up first, then update the Portainer stack with Re-pull image, or run:

```sh
docker compose pull
docker compose up -d --remove-orphans
```

Keep the same stack name and data volume. `docker compose down -v` deletes that volume.

Every pushed Git tag runs CI and publishes an image after successful checks. Arbitrary tags publish `:tag-<sanitized-tag>-<hash>`, `:sha-<commit>` and the Guestin `:edge` alias, without creating a GitHub release. SemVer tags (with optional `v` prefix) also create a GitHub release. A stable tag such as `v1.2.3` publishes `:1.2.3`, `:1.2`, `:latest` and the SHA alias. Prereleases and versions with build metadata do not move `latest` or minor aliases. Main pushes, pull requests, and manual workflows run checks only.

Before releasing, review the complete diff and commits since the preceding release, including pending changes, and commit notes to `docs/releases/<exact-tag>.md`. CI uses those notes for the GitHub release, falling back to GitHub-generated notes when the file is absent. See [AGENTS.md](../AGENTS.md). To tag a reviewed commit that includes its notes:

```sh
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin v1.2.3
```

Use a new version number for each release. You can pin a published version in Compose instead of `latest`.

## Troubleshooting

- Check container logs in Portainer or with `docker compose logs --tail=100 guestin`.
- Check health at `http://127.0.0.1:38471/api/v1/health` on the server.
- If installation or notifications are unavailable, confirm the public address uses HTTPS and matches `ORIGIN`.
- If a cloud device accepts a request but the door stays closed, check the device/scene configuration. Provider acceptance does not prove physical movement.
