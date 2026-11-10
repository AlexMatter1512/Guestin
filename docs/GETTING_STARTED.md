# Getting started with GuestIn

[Documentation](README.md) · [User guide](USER_GUIDE.md) · [Self-hosting reference](REFERENCE.md)

- [How it works](#how-it-works)
- [Deploy GuestIn](#deploy-guestin)
- [Install it on your phone](#install-it-on-your-phone)

## How it works

1. **Add your property.** Set its timezone and arrival defaults. The interactive tour helps you create your first property, example door, and access code. You can skip it at any time.
2. **Connect your doors.** Use generic HTTP webhooks, with editable eWeLink and Shelly Cloud presets. You can create an example door first and connect the device later.
3. **Create and share an access code.** Pick its doors, set their validity, add breakfast if needed, and send the guest link through whichever messaging app you use.
4. **Welcome your guests.** Their page shows available doors and breakfast. You can edit or revoke access and review activity from the host app.

Booking and calendar imports prepare a draft for you to check before saving.

## Deploy GuestIn

You need a server with Docker, a persistent data volume, and an HTTPS address. Images are available for **AMD64 and ARM64** on [Docker Hub](https://hub.docker.com/r/alexmatter/guestin).

### With Portainer

1. Open **Stacks → Add stack → Web editor** and paste [compose.yaml](../compose.yaml).
2. Change `ORIGIN` to your public address, for example `https://stay.example.com`, and `VAPID_SUBJECT` to your contact address, for example `mailto:you@example.com`.
3. Deploy the stack and point your HTTPS reverse proxy at the app.
4. Open the container's **Logs** and copy the `setupToken` from the `setup.required` entry.
5. Visit **`https://stay.example.com/host/`**, create the owner account, and follow the tour.

The app generates its setup token and encryption keys on first startup. There is no `.env` file to prepare for the stack, and no separate database server to install.

The Compose file publishes **`127.0.0.1:38471`** for a reverse proxy running on the server. A proxy on the same Docker network can instead use **`guestin:3000`**. **Public deployments require HTTPS.** Set `ORIGIN` to the exact public `https://` address and terminate TLS at the reverse proxy, or configure `TLS_CERT` and `TLS_KEY` for direct TLS. The server otherwise listens on all interfaces over plaintext HTTP; setting `ORIGIN` alone does not enable TLS. HTTP exposes passwords and session cookies to interception, and an HTTP `ORIGIN` omits the cookie’s `Secure` flag. Keep the backend inaccessible from untrusted networks: retain the loopback port binding, or use a private Docker network accessible only to your proxy. Restrict any published direct-TLS port appropriately.

The supplied Compose file sets `TRUST_PROXY=1`. Configure the proxy to **overwrite `X-Real-IP` with the connecting client’s address**, and allow only that proxy to reach the backend. This gives each visitor their own IP rate limit. Use `TRUST_PROXY=0` for direct connections. See the [reverse proxy examples](REFERENCE.md#https) before deploying.

### With Docker Compose

Save [compose.yaml](../compose.yaml), edit the two configuration values above, then run:

```sh
docker compose up -d --remove-orphans
docker compose logs guestin
```

Copy the setup token from the logs and create your owner account at `/host/`.

## Install it on your phone

The onboarding tour walks you through installation and notification access, then offers SMTP setup as its final step for owners. **Settings → Install app** keeps the iOS and Android instructions available later.

- **Android and desktop:** use the install action when your browser offers it, or the browser's install menu.
- **iPhone and iPad:** open the app in Safari, choose **Share → Add to Home Screen**, then open the installed app to enable notifications.

You can keep using the app if you skip installation or notifications. Door opening and breakfast redemption require an internet connection to your server; unfinished host forms stay on your device.

For passwords, email recovery and team access, see the [user guide](USER_GUIDE.md). For environment settings, reverse proxies and backups, see the [self-hosting reference](REFERENCE.md).
