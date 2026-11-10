# oshost

**Welcome your guests. Share a link. Keep control of your doors.**

oshost is a self-hosted guest access app for B&Bs, guesthouses, and small hospitality teams. Create an access code, choose the doors and times it allows, and share a guest link. Your guests open it in their browser, with no account to create.

One Docker container serves the host app, guest app, and a public breakfast counter. Your access records, shared notification history, and saved connections stay on your server.

[Get started](#get-started) · [How it works](#how-it-works) · [Documentation](#documentation)

![oshost host workspace in dark mode, with grouped preferences and property settings](docs/images/host-workspace.png)

## On your phone

<p>
  <img src="docs/images/host-codes-mobile.png" width="240" alt="Host access codes and structure selector on a phone in light mode" />
  <img src="docs/images/host-calendar-mobile.png" width="240" alt="Calendar with dots marking dates that contain access codes" />
  <img src="docs/images/host-doors-mobile.png" width="240" alt="Host door list on a phone" />
  <img src="docs/images/host-create-mobile-dark.png" width="240" alt="The simplified full-width Create drawer in dark mode" />
</p>

## A workspace for you. A simple welcome for guests.

- **Create access codes in seconds.** Give each guest the doors they need, with separate dates and single-use rules for each door. Copy a link or prepare a welcome message in Italian or English.
- **Keep staff access separate.** Flag codes for cleaners, laundry and other staff to remove door time windows. Switch to Staff codes for a calendar-free list with usage counts and filters for non-revoked, revoked or all codes. Staff access can still be paused or revoked.
- **Manage your places together.** Switch structures from the header, organize doors, invite collaborators, and test device connections. The bell opens shared notification history; the statistics tab shows usage reports.
- **Keep breakfast simple.** Give a code its own allowance. Guests redeem from their page; your breakfast team sees how many breakfasts were actually used, without guest details. Settings lets you open the page or protect it with a password.
- **Start manually, add helpers later.** KrossBooking, iCal calendars, and optional Gemini screenshot reading can fill in a draft. You review it before creating a code.
- **Use it like an app.** Install separate host and guest web apps. Choose a light or dark theme and enable host notifications for access and breakfast activity. Browse codes in a calendar with marked dates, and drag doors into order on your phone.

The host app supports **Italian and English**. The guest app supports **Italian, English, French, Spanish, and German**.

## How it works

1. **Add your property.** Set its timezone and arrival defaults. The interactive tour helps you create your first property, example door, and access code. You can skip it at any time.
2. **Connect your doors.** Use generic HTTP webhooks, with editable eWeLink and Shelly Cloud presets. You can create an example door first and connect the device later.
3. **Create and share an access code.** Pick its doors, set their validity, add breakfast if needed, and send the guest link through whichever messaging app you use.
4. **Welcome your guests.** Their page shows available doors and breakfast. You can edit or revoke access and review activity from the host app.

Booking and calendar imports prepare a draft for you to check before saving.

## Get started

You need a server with Docker, a persistent data volume, and an HTTPS address. Images are available for **AMD64 and ARM64** on [Docker Hub](https://hub.docker.com/r/alexmatter/oshost).

### With Portainer

1. Open **Stacks → Add stack → Web editor** and paste [compose.yaml](compose.yaml).
2. Change `ORIGIN` to your public address, for example `https://stay.example.com`, and `VAPID_SUBJECT` to your contact address, for example `mailto:you@example.com`.
3. Deploy the stack and point your HTTPS reverse proxy at the app.
4. Open the container's **Logs** and copy the `setupToken` from the `setup.required` entry.
5. Visit **`https://stay.example.com/host/`**, create the owner account, and follow the tour.

The app generates its setup token and encryption keys on first startup. There is no `.env` file to prepare for the stack, and no separate database server to install.

The Compose file publishes **`127.0.0.1:38471`** for a reverse proxy running on the server. A proxy on the same Docker network can instead use **`oshost:3000`**. **Public deployments require HTTPS.** Set `ORIGIN` to the exact public `https://` address and terminate TLS at the reverse proxy, or configure `TLS_CERT` and `TLS_KEY` for direct TLS. The server otherwise listens on all interfaces over plaintext HTTP; setting `ORIGIN` alone does not enable TLS. HTTP exposes passwords and session cookies to interception, and an HTTP `ORIGIN` omits the cookie’s `Secure` flag. Keep the backend inaccessible from untrusted networks: retain the loopback port binding, or use a private Docker network accessible only to your proxy. Restrict any published direct-TLS port appropriately.

The supplied Compose file sets `TRUST_PROXY=1`. Configure the proxy to **overwrite `X-Real-IP` with the connecting client’s address**, and allow only that proxy to reach the backend. This gives each visitor their own IP rate limit. Use `TRUST_PROXY=0` for direct connections. See the [reverse proxy examples](docs/REFERENCE.md#https) before deploying.

Owners and collaborators can rotate their password under **Your account → Change password** using their current password. A successful change signs out every device. Login and password-change attempts also have persistent per-account backoff, independent of IP address.

**Password recovery and email verification:** the last onboarding step and **Settings → Email delivery (SMTP)** let owners configure any SMTP server (host, port, security, optional credentials, sender address and name). Credentials are encrypted with `APP_KEY` and never returned to the browser. Use SSL/TLS for implicit TLS (typically 465 or 2465), or STARTTLS for an enforced TLS upgrade (typically 25, 587 or 2587). Unencrypted delivery is available for trusted local relays. Save the settings, send a test email to yourself, then send a verification email. Every user can verify their own address under **Your account**. Verification links expire after 10 minutes; verification is required for recovery by email. SMTP configuration alone does not verify an account.

On the sign-in screen, **Forgot password?** offers **Ask for a password reset link**. Owners receive a private notification linking to **Settings → Team**, where the account shows the pending request. An owner can generate a link for that specific account and share it privately. If SMTP is configured, verified users can instead choose **Send reset email**. Owner assistance remains available if email is unavailable or the address is unverified. Public requests do not reveal whether an account exists. Email requests are limited to one per account and purpose per minute.

Reset links expire after **10 minutes**, work **once**, and replace any earlier reset link for that account. A successful reset revokes all existing sessions and outstanding recovery links. Password changes also invalidate pending recovery links. Recovery and verification links are separate. Migration 9 adds SMTP settings, email verification, short-lived account tokens, delivery throttling, and pending reset requests without changing existing users; existing email addresses start unverified. Workspace wipe removes these settings and records too. With SMTP disabled, a sole owner who loses access needs an existing session or another owner to generate a recovery link.


### With Docker Compose

Save [compose.yaml](compose.yaml), edit the two configuration values above, then run:

```sh
docker compose up -d
docker compose logs oshost
```

Copy the setup token from the logs and create your owner account at `/host/`.

## Install it on your phone

The onboarding tour walks you through installation and notification access, then offers SMTP setup as its final step for owners. **Settings → Install app** keeps the iOS and Android instructions available later.

- **Android and desktop:** use the install action when your browser offers it, or the browser's install menu.
- **iPhone and iPad:** open the app in Safari, choose **Share → Add to Home Screen**, then open the installed app to enable notifications.

You can keep using the app if you skip installation or notifications. Door opening and breakfast redemption require an internet connection to your server; unfinished host forms stay on your device.

## Bring in details from a calendar or booking

**KrossBooking:** connect your account, complete verification, find the reservation, and review the suggested code. The bearer token is encrypted in the server’s SQLite database and shared across the team’s devices. The browser never stores or receives it; your Kross password is not saved.

**iCal:** upload a calendar or fetch a saved calendar URL, inspect its events, then choose the door those events belong to. For example, a calendar for “Room 2” maps to the Room 2 door. In the draft, you can add the main entrance or other doors before saving. Importing a calendar alone creates no access codes.

**AI:** optionally connect a Gemini API key and extract guest details from a screenshot. KrossBooking, iCal and AI each show source details, mapped doors, dates and links before you choose **Use details in access code**. You still review and save the final form yourself.

All connectors are optional. You can create your first access code without configuring any of them. Set reusable check-in and instructions links under **Settings → Guest links** for each structure. New forms use those defaults; reservation-specific links from a connector take priority. New breakfast allowances start the day after arrival by default, with editable dates.

## Team permissions

**Owner** and **admin** mean the same unrestricted role. Under **Settings → Team**, owners can grant each collaborator permission to create ordinary access codes, add new doors, use booking connectors, and create staff access codes. Code permissions also control managing codes of that type. Staff access codes are separate from collaborator accounts.

New collaborators start with no permissions. Existing staff accounts become collaborators while retaining their previous code creation and connector capabilities. Owners can delete collaborators or promote them to owners. Account management, connector configuration, permanent deletion and database wiping always require an owner role.

Owners can only delete their own accounts; another owner must remain. An owner cannot delete or demote another owner. Deleting an account signs it out everywhere and preserves shared data and access codes.

## Structure and access-code management

Internal notes are hidden in access-code forms until you enable **Internal notes**. Hiding the form preserves existing notes.

Owners can deactivate, reactivate or permanently delete structures under **Settings → Properties**. Deactivated structures disappear from everyday views, and guest links and connector requests stop working. Their data stays in the database and backups; notification retention pauses while they are inactive. Reactivating restores access to the existing codes.

**Delete permanently** removes a structure and all its related doors, access codes, usage history, notifications, connectors and settings from the current database. Owners can also permanently delete individual access codes under **Manage access**, including revoked codes. Both require typing the displayed confirmation; deletion cannot be undone. Existing backup files are separate and retain their contents.

Owners can use **Doors JSON** on the doors page or **Access codes JSON** on the codes page to download or upload just that structure’s records. Append adds missing IDs and skips existing records. **Override current list** replaces the entire selected list, including disabled doors or guest/staff/revoked codes. It requires a warning acknowledgement and typed confirmation. Door replacement removes permissions for omitted doors; access-code replacement restores the file’s saved guest tokens, usage and revocation, so old files can reactivate access. Other structures remain unchanged. These files contain working credentials: keep them private. Import doors first when transferring codes to another installation.

The webhook form uses key/value rows for headers and query parameters. The + button adds a row only after existing rows are filled. Provider presets put authentication/query values in those rows; the URL field holds the base endpoint.

## Notification history and push

The host bell includes a personal unread badge. Clicking a notification marks it read across your devices and opens its related code or door when available; teammates keep their own read status. Opening or scrolling through history does not mark anything read. Read entries are grayed out.
You can also mark the selected structure's history as read at once. History loads 20 entries at a time and automatically appends older entries as you scroll. Door usage can show the door's primary photo; code changes use a key icon and errors use a warning icon.

The bell shows the selected structure’s history for everyone on your team. Notifications are kept for **three months** by default. Change that period and the maximum number of notifications under **Settings → Notifications**. The default count limit is **1,000 per structure**; the oldest entries are deleted when either limit is reached. Statistics are preserved independently.

While the host app is open, notifications, access-code lists, and usage counts update over an authenticated WebSocket. Lists animate additions and changes, respecting reduced-motion preferences. Access-code creation can notify the team with the creator, code name, and validity dates. Save in-app preferences without enabling browser push.

Push notifications are optional. Each device chooses the structures and event types it receives. History and push messages support Italian and English and include the access-code name when available. You can also receive alerts for invalid guest links, including attempts to load the guest page. Invalid-link alerts are grouped per client and bounded globally; suppressed attempts are summarized on the next invalid request after each one-minute window. Changing push filters does not hide or delete the shared history.

Guest links keep their access code in the address, including when guests change pages or language. The token is never saved in browser storage. For visit history, the browser remembers just the last code’s name and visit date to help explain later invalid-link attempts; this history is an unverified hint, never proof of access.

## Updates and backups

Owners can download a portable **JSON backup** under **Settings → Data management**, then upload it on another oshost installation. It includes structures, doors, guest tokens, permissions, usage, breakfast redemptions and history. Photos, user accounts and booking connector logins are excluded. Restore adds missing records and preserves the current state of existing ones. **The file contains guest tokens and device credentials: keep it private.**

Every pushed Git tag runs CI and publishes a Docker image after successful checks. Arbitrary tags use `tag-<sanitized-tag>-<hash>` image names; SemVer tags (with optional `v` prefix) also create a GitHub release with release notes. Stable version tags update `latest` and the `MAJOR.MINOR` alias; prereleases and build-metadata versions do not. Changes pushed to `main` run checks without publishing an image. Release notes in `docs/releases/<exact-tag>.md` take priority over GitHub-generated notes. See [AGENTS.md](AGENTS.md) for the release preparation process.

In Portainer, update the stack with **Re-pull image** enabled. With Compose:

```sh
docker compose pull
docker compose up -d
```

Keep the same stack name and data volume. The volume holds your database, uploaded images, and encryption keys. **Back it up before upgrading; deleting it deletes your installation.** The [backup and restore guide](docs/REFERENCE.md#backups-and-restore) explains how to make a recoverable backup.

Upgrading an older installation? Keep its original keys for the first upgrade; see [existing installations](docs/REFERENCE.md#docker--portainer).

## Documentation

- [Self-hosting, configuration, backups, and development](docs/REFERENCE.md)
- [API reference](docs/API.md)
- [Credits and third-party notices](docs/PROVENANCE.md)
- [Contributing](CONTRIBUTING.md)

Device integrations report whether a request was accepted by the provider; they cannot confirm that a door physically opened. Test your device setup before sharing access with guests.

## Contributing and licensing

Issues, usability feedback, and contributions are welcome. Describe what you expected, what happened, and the browser or device you used. Keep passwords, guest links, and API keys out of issue reports.

The project license is under review. See [credits and third-party notices](docs/PROVENANCE.md) for the licenses of reused components.
