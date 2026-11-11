# GuestIn

> [!WARNING]
> GuestIn is currently in beta. Breaking changes may occur in releases before version 1.0.

**Guest access, connected doors, and breakfast coordination—for short-term rentals.**

GuestIn brings three web apps together: a workspace for **hosts**, a simple access page for **guests and staff**, and live breakfast totals for **local partner cafés**. Self-host it in one Docker container and manage your properties remotely.

[Website](https://guestin.app) · [Get started](docs/GETTING_STARTED.md) · [Documentation](docs/README.md) · [Contribute](CONTRIBUTING.md)

## Features

- **Flexible access:** guest links with per-door dates and single-use rules; time-unrestricted staff codes; pause or revoke access whenever needed.
- **Affordable IoT:** generic webhooks for eWeLink/Sonoff, Shelly, Home Assistant, and other devices or hubs.
- **Booking imports:** prepare access-code drafts from iCal calendars (including Airbnb and Booking.com), KrossBooking, or optional AI screenshot extraction.
- **Live activity:** WebSocket updates, optional notifications, shared history, and usage reports.
- **Breakfast management:** guest allowances and redemptions, used/assigned counts, and a live, optionally password-protected café page.
- **Team control:** multiple properties, collaborator permissions, and JSON imports, exports, and backups.
- **Mobile and multilingual:** installable web apps, light/dark themes, and shared date formats. Host and café pages support Italian and English; guest pages also support French, Spanish, and German.

## Screenshots

![GuestIn host workspace in dark mode, with grouped preferences and property settings](docs/images/host-workspace.png)

<p>
  <img src="docs/images/host-codes-mobile.png" width="240" alt="Access codes and structure selector on a phone" />
  <img src="docs/images/host-calendar-mobile.png" width="240" alt="Calendar showing dates with access codes" />
  <img src="docs/images/host-doors-mobile.png" width="240" alt="Door management on a phone" />
  <img src="docs/images/host-create-mobile-dark.png" width="240" alt="Create menu in dark mode" />
</p>

## Documentation

- [Getting started](docs/GETTING_STARTED.md) — Docker, Portainer, first setup, and phone installation.
- [User guide](docs/USER_GUIDE.md) — properties, doors, access codes, integrations, team permissions, and notifications.
- [Partner breakfast page](docs/USER_GUIDE.md#partner-breakfast-page) — live totals, date ranges, languages, and optional notifications.
- [Upgrades and backups](docs/UPGRADING.md) — existing installations, updates, image tags, and data transfers.
- [Self-hosting reference](docs/REFERENCE.md) — configuration, HTTPS, backup/restore, and troubleshooting.
- [API reference](docs/API.md) · [Contributing and development](CONTRIBUTING.md) · [Security reporting](SECURITY.md).

Feedback and contributions are welcome—especially new integrations, translations, and support for more devices and platforms.

Licensed under [MIT](LICENSE). [Third-party notice](docs/licenses/shadcn-svelte-LICENSE.md).
