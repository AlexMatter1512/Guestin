# Self-hosting oshost

For the quickest start, use the [README](../README.md). The same [Compose file](../compose.yaml) works with Docker Compose and Portainer.

## Configuration

Edit the values in the Compose `environment` section before deploying:

| Setting | Purpose |
| --- | --- |
| `ORIGIN` | Exact public HTTPS address, such as `https://stay.example.com`. |
| `VAPID_SUBJECT` | Contact address for push notifications, such as `mailto:you@example.com`. |
| `DB_PATH` | SQLite location; keep `/app/data/oshost.sqlite` when using the supplied volume. |
| `TRUST_PROXY` | Enable only when your reverse proxy overwrites `X-Real-IP`. |
| `LOG_LEVEL` | `info` by default; use `debug` temporarily for troubleshooting. |
| `LOG_FILE` | Log file in the data volume; `-` writes only to container stdout. |

First startup creates `/app/data/runtime-secrets.json` containing encryption, setup, and push keys. The initial setup token appears in container logs until the first owner exists. Keep the data volume and keys when updating the stack.

Existing installations without `runtime-secrets.json` should supply their original `APP_KEY`, `SETUP_TOKEN`, `VAPID_PUBLIC_KEY`, and `VAPID_PRIVATE_KEY` once. Startup adopts those keys into the volume. It refuses to replace a missing encryption key for an existing database.

## HTTPS

The host port is `127.0.0.1:38471`. Point your domain at the server and configure a reverse proxy. For Caddy running directly on the server:

```caddyfile
stay.example.com {
  reverse_proxy 127.0.0.1:38471
}
```

Allow ports 80 and 443. A proxy on the same Docker network can use `oshost:3000`. Forward paths unchanged. HTTPS is required for phone installation and push notifications.

For direct TLS, mount your certificates read-only and set both `TLS_CERT` and `TLS_KEY` to their paths inside the container. Set `ORIGIN` to the resulting HTTPS address.

## Connections

Owners configure connections in Settings. KrossBooking bearer tokens, calendar URLs, Gemini keys, and door credentials are stored encrypted in SQLite. The server attaches provider credentials to requests; staff browsers cannot read them. Kross passwords are used only during sign-in and are never saved.

Connectors prepare drafts for review. They do not synchronize bookings or create access codes automatically.

## Notifications

Notification history belongs to the structure and is shared with the team. Its default retention is three calendar months, adjustable from 1 to 120 months in Settings → Notifications. Cleanup runs automatically; shortening retention removes older entries. Reports retain lifetime totals independently of this history.

Push selection is local to each device, with delivery preferences attached to that device’s server subscription. Disabling push on one device does not disable another. iPhone/iPad push requires opening the installed Home Screen app.

## Breakfast page

Settings → Breakfast provides a direct link and optional password protection. Owners can set, change, or remove the password. Signed-in hosts can open the page directly. Other viewers enter the shared password and stay signed in for up to 12 hours. Changing the password invalidates existing breakfast sessions. The page and API expose aggregate totals only.

## Backups

From the stack directory:

```sh
docker compose exec oshost bun scripts/backup.ts /app/data/backup-2026-11-09
docker compose cp oshost:/app/data/backup-2026-11-09 ./backup-2026-11-09
```

Choose a fresh backup directory each time. In Portainer, run the same Bun command from the container console, then copy the resulting directory to secure storage.

A backup contains the database, runtime keys, and uploaded assets. Protect it as sensitive data. To restore, stop oshost, replace the database and assets, and put `runtime-secrets.json` beside the restored database. Remove stale SQLite `-wal`/`-shm` files only while stopped, then restart the app. Older backups can provide their original keys through the environment for the first start.

## Updates and releases

Back up first, then update the Portainer stack with Re-pull image, or run:

```sh
docker compose pull
docker compose up -d
```

Keep the same stack name and data volume. `docker compose down -v` deletes that volume.

Only version tags publish images. A stable tag such as `v1.2.3` publishes `:1.2.3`, `:1.2`, and `:latest`. Prereleases do not move `latest`. Main pushes, pull requests, and manual workflows run checks only. To publish a reviewed commit:

```sh
git tag v1.2.3
git push origin v1.2.3
```

Use a new version number for each release. You can pin a published version in Compose instead of `latest`.

## Troubleshooting

- Check container logs in Portainer or with `docker compose logs --tail=100 oshost`.
- Check health at `http://127.0.0.1:38471/api/v1/health` on the server.
- If installation or notifications are unavailable, confirm the public address uses HTTPS and matches `ORIGIN`.
- If a cloud device accepts a request but the door stays closed, check the device/scene configuration. Provider acceptance does not prove physical movement.
