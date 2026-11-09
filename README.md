# oshost

**Welcome your guests. Share a link. Keep control of your doors.**

oshost is a self-hosted guest access app for B&Bs, guesthouses, and small hospitality teams. Create an access code, choose the doors and times it allows, and share a guest link. Your guests open it in their browser, with no account to create.

One Docker container serves the host app, guest app, and a public breakfast counter. Your data stays on your server.

[Get started](#get-started) · [How it works](#how-it-works) · [Documentation](#documentation)

![oshost host workspace in dark mode, with grouped preferences and property settings](docs/images/host-workspace.png)

## A workspace for you. A simple welcome for guests.

- **Create access codes in seconds.** Give each guest the doors they need, with separate dates and single-use rules for each door. Copy a link or prepare a welcome message in Italian or English.
- **Manage your places together.** Organize properties and doors, invite staff, test device connections, and see what happened in the activity feed.
- **Keep breakfast simple.** Give a code its own breakfast allowance. Guests redeem from their page; your breakfast team sees public totals without guest details.
- **Start manually, add helpers later.** KrossBooking, iCal calendars, and optional Gemini screenshot reading can fill in a draft. You review it before creating a code.
- **Use it like an app.** Install separate host and guest web apps. Choose a light or dark theme and enable host notifications for access and breakfast activity.

The host app supports **Italian and English**. The guest app supports **Italian, English, French, Spanish, and German**.

## How it works

1. **Add your property.** Set its timezone and arrival defaults. The interactive tour helps you create your first property, example door, and access code. You can skip it at any time.
2. **Connect your doors.** Use eWeLink webhooks or Shelly Cloud. You can create an example door first and connect the device later.
3. **Create and share an access code.** Pick its doors, set their validity, add breakfast if needed, and send the guest link through whichever messaging app you use.
4. **Welcome your guests.** Their page shows available doors and breakfast. You can edit or revoke access and review activity from the host app.

A code is the central record. Connectors never issue codes automatically, and there is no background booking synchronization to configure.

## Get started

You need a server with Docker, a persistent data volume, and an HTTPS address. Images are available for **AMD64 and ARM64** on [Docker Hub](https://hub.docker.com/r/alexmatter/oshost).

### With Portainer

1. Open **Stacks → Add stack → Web editor** and paste [compose.yaml](compose.yaml).
2. Change `ORIGIN` to your public address, for example `https://stay.example.com`, and `VAPID_SUBJECT` to your contact address, for example `mailto:you@example.com`.
3. Deploy the stack and point your HTTPS reverse proxy at the app.
4. Open the container's **Logs** and copy the `setupToken` from the `setup.required` entry.
5. Visit **`https://stay.example.com/host/`**, create the owner account, and follow the tour.

The app generates its setup token and encryption keys on first startup. There is no `.env` file to prepare for the stack, and no separate database server to install.

The Compose file publishes **`127.0.0.1:38471`** for a reverse proxy running on the server. A proxy on the same Docker network can instead use **`oshost:3000`**. HTTPS enables web app installation and notifications on phones. See the [reverse proxy examples](docs/REFERENCE.md#docker--portainer) for more detail.

### With Docker Compose

Save [compose.yaml](compose.yaml), edit the two configuration values above, then run:

```sh
docker compose up -d
docker compose logs oshost
```

Copy the setup token from the logs and create your owner account at `/host/`.

## Install it on your phone

The onboarding tour walks you through installation and notification access. You can also manage these later in the host app.

- **Android and desktop:** use the install action when your browser offers it, or the browser's install menu.
- **iPhone and iPad:** open the app in Safari, choose **Share → Add to Home Screen**, then open the installed app to enable notifications.

You can keep using the app if you skip installation or notifications. Door opening and breakfast redemption require an internet connection to your server; unfinished host forms stay on your device.

## Bring in details from a calendar or booking

**KrossBooking:** connect your account, complete verification, find the reservation, and review the suggested code.

**iCal:** upload a calendar or fetch a saved calendar URL, inspect its events, then choose the door those events belong to. For example, a calendar for “Room 2” maps to the Room 2 door. In the draft, you can add the main entrance or other doors before saving. Importing a calendar alone creates no access codes.

**Screenshots:** optionally configure a Gemini API key and review the extracted guest details and dates before saving.

All connectors are optional. You can create your first access code without configuring any of them.

## Updates and backups

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
- [Verification notes](docs/VERIFICATION.md)
- [Source credits and licensing](docs/PROVENANCE.md)

Device integrations report whether a request was accepted by the provider; they cannot confirm that a door physically opened. Test your device setup before sharing access with guests.

## Contributing and licensing

Issues, usability feedback, and contributions are welcome. Describe what you expected, what happened, and the browser or device you used. Keep passwords, guest links, and API keys out of issue reports.

The project license is still being decided. Reused components retain their original notices and obligations; see [source provenance](docs/PROVENANCE.md). A project-wide open-source license has not yet been granted.
